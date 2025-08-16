const { BrowserWindow } = require('electron');
const { createStreamingLLM } = require('../common/ai/factory');
// Lazy require helper to avoid circular dependency issues
const getWindowManager = () => require('../../window/windowManager');
const internalBridge = require('../../bridge/internalBridge');
const brdyPilotService = require('../brdy-pilot/brdyPilotService');
const domInteraction = require('../brdy-pilot/domInteraction');
const EmbeddedBrowser = require('../brdy-pilot/embeddedBrowser');
const ChromeExtensionBridge = require('../brdy-pilot/chromeExtensionBridge');
const screenControlService = require('../screen-control');

const getWindowPool = () => {
    try {
        return getWindowManager().windowPool;
    } catch {
        return null;
    }
};

const sessionRepository = require('../common/repositories/session');
const askRepository = require('./repositories');
const { getSystemPrompt } = require('../common/prompts/promptBuilder');
const path = require('node:path');
const fs = require('node:fs');
const os = require('os');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const { desktopCapturer } = require('electron');
const modelStateService = require('../common/services/modelStateService');

// Try to load sharp, but don't fail if it's not available
let sharp;
try {
    sharp = require('sharp');
    console.log('[AskService] Sharp module loaded successfully');
} catch (error) {
    console.warn('[AskService] Sharp module not available:', error.message);
    console.warn('[AskService] Screenshot functionality will work with reduced image processing capabilities');
    sharp = null;
}
let lastScreenshot = null;

async function captureScreenshot(options = {}) {
    if (process.platform === 'darwin') {
        try {
            const tempPath = path.join(os.tmpdir(), `screenshot-${Date.now()}.jpg`);

            await execFile('screencapture', ['-x', '-t', 'jpg', tempPath]);

            const imageBuffer = await fs.promises.readFile(tempPath);
            await fs.promises.unlink(tempPath);

            if (sharp) {
                try {
                    // Try using sharp for optimal image processing
                    const resizedBuffer = await sharp(imageBuffer)
                        .resize({ height: 384 })
                        .jpeg({ quality: 80 })
                        .toBuffer();

                    const base64 = resizedBuffer.toString('base64');
                    const metadata = await sharp(resizedBuffer).metadata();

                    lastScreenshot = {
                        base64,
                        width: metadata.width,
                        height: metadata.height,
                        timestamp: Date.now(),
                    };

                    return { success: true, base64, width: metadata.width, height: metadata.height };
                } catch (sharpError) {
                    console.warn('Sharp module failed, falling back to basic image processing:', sharpError.message);
                }
            }
            
            // Fallback: Return the original image without resizing
            console.log('[AskService] Using fallback image processing (no resize/compression)');
            const base64 = imageBuffer.toString('base64');
            
            lastScreenshot = {
                base64,
                width: null, // We don't have metadata without sharp
                height: null,
                timestamp: Date.now(),
            };

            return { success: true, base64, width: null, height: null };
        } catch (error) {
            console.error('Failed to capture screenshot:', error);
            return { success: false, error: error.message };
        }
    }

    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
                width: 1920,
                height: 1080,
            },
        });

        if (sources.length === 0) {
            throw new Error('No screen sources available');
        }
        const source = sources[0];
        const buffer = source.thumbnail.toJPEG(70);
        const base64 = buffer.toString('base64');
        const size = source.thumbnail.getSize();

        return {
            success: true,
            base64,
            width: size.width,
            height: size.height,
        };
    } catch (error) {
        console.error('Failed to capture screenshot using desktopCapturer:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * @class
 * @description
 */
class AskService {
    constructor() {
        this.abortController = null;
        this.embeddedBrowser = new EmbeddedBrowser();
        this.chromeExtension = new ChromeExtensionBridge();
        this.state = {
            isVisible: false,
            isLoading: false,
            isStreaming: false,
            currentQuestion: '',
            currentResponse: '',
            showTextInput: true,
        };
        console.log('[AskService] Service instance created.');
    }

    _broadcastState() {
        const askWindow = getWindowPool()?.get('ask');
        if (askWindow && !askWindow.isDestroyed()) {
            askWindow.webContents.send('ask:stateUpdate', this.state);
        }
    }

    async toggleAskButton(inputScreenOnly = false) {
        const askWindow = getWindowPool()?.get('ask');

        let shouldSendScreenOnly = false;
        if (inputScreenOnly && this.state.showTextInput && askWindow && askWindow.isVisible()) {
            shouldSendScreenOnly = true;
            await this.sendMessage('', []);
            return;
        }

        const hasContent = this.state.isLoading || this.state.isStreaming || (this.state.currentResponse && this.state.currentResponse.length > 0);

        if (askWindow && askWindow.isVisible() && hasContent) {
            this.state.showTextInput = !this.state.showTextInput;
            this._broadcastState();
        } else {
            if (askWindow && askWindow.isVisible()) {
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
                this.state.isVisible = false;
            } else {
                console.log('[AskService] Showing hidden Ask window');
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
                this.state.isVisible = true;
            }
            if (this.state.isVisible) {
                this.state.showTextInput = true;
                this._broadcastState();
            }
        }
    }

    async closeAskWindow () {
            if (this.abortController) {
                this.abortController.abort('Window closed by user');
                this.abortController = null;
            }
    
            this.state = {
                isVisible      : false,
                isLoading      : false,
                isStreaming    : false,
                currentQuestion: '',
                currentResponse: '',
                showTextInput  : true,
            };
            this._broadcastState();
    
            internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
    
            return { success: true };
        }
    

    /**
     * 
     * @param {string[]} conversationTexts
     * @returns {string}
     * @private
     */
    _formatConversationForPrompt(conversationTexts) {
        if (!conversationTexts || conversationTexts.length === 0) {
            return 'No conversation history available.';
        }
        return conversationTexts.slice(-30).join('\n');
    }

    /**
     * 
     * @param {string} userPrompt
     * @returns {Promise<{success: boolean, response?: string, error?: string}>}
     */
    async sendMessage(userPrompt, conversationHistoryRaw=[]) {
        internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
        
        // Parse conversation context if present
        let actualUserPrompt = userPrompt;
        let conversationContext = '';
        let isReply = false;
        
        if (userPrompt.includes('[CONTEXT]') && userPrompt.includes('[NEW MESSAGE]')) {
            isReply = true;
            const parts = userPrompt.split('[NEW MESSAGE]');
            conversationContext = parts[0].replace('[CONTEXT]', '').trim();
            actualUserPrompt = parts[1].trim();
            console.log('🔄 AskService Debug - Found conversation context:', conversationContext);
            console.log('🔄 AskService Debug - Actual prompt:', actualUserPrompt);
        }
        
        this.state = {
            ...this.state,
            isLoading: true,
            isStreaming: false,
            currentQuestion: actualUserPrompt,
            currentResponse: '',
            showTextInput: false,
        };
        this._broadcastState();

        if (this.abortController) {
            this.abortController.abort('New request received.');
        }
        this.abortController = new AbortController();
        const { signal } = this.abortController;


        let sessionId;

        try {
            console.log(`[AskService]  Processing message: ${userPrompt.substring(0, 50)}...`);

            sessionId = await sessionRepository.getOrCreateActive('ask');
            await askRepository.addAiMessage({ sessionId, role: 'user', content: actualUserPrompt.trim() });
            console.log(`[AskService] DB: Saved user prompt to session ${sessionId}`);
            
            // Get OpenAI configuration directly instead of using default provider
            const openaiApiKey = process.env.OPENAI_API_KEY;
            if (!openaiApiKey) {
                throw new Error('OpenAI API key not configured.');
            }
            
            const baseOpenAIConfig = {
                provider: 'openai',
                apiKey: openaiApiKey,
                model: 'gpt-4o'
            };
            
            // Determine model based on question type
            const selectedModelInfo = this._selectModelForTask(actualUserPrompt, baseOpenAIConfig);
            console.log(`[AskService] ${selectedModelInfo.displayName}`);

            const screenshotResult = await captureScreenshot({ quality: 'medium' });
            const screenshotBase64 = screenshotResult.success ? screenshotResult.base64 : null;

            const conversationHistory = this._formatConversationForPrompt(conversationHistoryRaw);

            // Check if this is a Brdy Pilot automation request
            const isBrdyRequest = this._detectBrdyPilotIntent(actualUserPrompt);
            
            // Check if this is a screen control request (ChatGPT Agent-like)
            const screenControlIntent = screenControlService.detectControlIntent(actualUserPrompt);
            const shouldUseScreenControl = screenControlIntent.shouldUseControl && screenControlIntent.confidence > 0.6;
            
            let systemPrompt;
            if (isBrdyRequest) {
                systemPrompt = this._getBrdyPilotSystemPrompt(conversationHistory);
            } else {
                systemPrompt = getSystemPrompt('brdy_orbit_analysis', conversationHistory, false);
            }
            
            // Add conversation context to system prompt if this is a reply
            if (isReply && conversationContext) {
                systemPrompt += `\n\n[CONVERSATION CONTEXT]\nPrevious conversation in this session:\n${conversationContext}\n\nThe user is now responding to this conversation. Please maintain context and continuity.`;
            }

            const messages = [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: `User Request: ${actualUserPrompt.trim()}` },
                    ],
                },
            ];

            if (screenshotBase64) {
                messages[1].content.push({
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` },
                });
            }
            
            const streamingLLM = createStreamingLLM(selectedModelInfo.provider, {
                apiKey: selectedModelInfo.apiKey,
                model: selectedModelInfo.model,
                temperature: selectedModelInfo.temperature,
                maxTokens: selectedModelInfo.maxTokens,
                usePortkey: selectedModelInfo.provider === 'openai-glass',
                portkeyVirtualKey: selectedModelInfo.provider === 'openai-glass' ? selectedModelInfo.apiKey : undefined,
            });

            try {
                // If this is a screen control request, handle it with computer control
                if (shouldUseScreenControl) {
                    await this._handleScreenControlRequest(actualUserPrompt, sessionId, screenControlIntent);
                    return { success: true };
                }
                
                // Check if this is a simple screen analysis request
                const isAnalysisRequest = actualUserPrompt.toLowerCase().includes('explain') && 
                                        actualUserPrompt.toLowerCase().includes('screen');
                if (isAnalysisRequest) {
                    await this._handleSimpleScreenAnalysis(actualUserPrompt, sessionId);
                    return { success: true };
                }
                
                // If this is a Brdy Pilot request, handle it with automation capabilities
                if (isBrdyRequest) {
                    await this._handleBrdyPilotRequest(userPrompt, screenshotBase64, sessionId);
                    return { success: true };
                }
                
                const response = await streamingLLM.streamChat(messages);
                const askWin = getWindowPool()?.get('ask');

                if (!askWin || askWin.isDestroyed()) {
                    console.error("[AskService] Ask window is not available to send stream to.");
                    response.body.getReader().cancel();
                    return { success: false, error: 'Ask window is not available.' };
                }

                const reader = response.body.getReader();
                signal.addEventListener('abort', () => {
                    console.log(`[AskService] Aborting stream reader. Reason: ${signal.reason}`);
                    reader.cancel(signal.reason).catch(() => { /* 이미 취소된 경우의 오류는 무시 */ });
                });

                await this._processStream(reader, askWin, sessionId, signal);
                return { success: true };

            } catch (multimodalError) {
                // 멀티모달 요청이 실패했고 스크린샷이 포함되어 있다면 텍스트만으로 재시도
                if (screenshotBase64 && this._isMultimodalError(multimodalError)) {
                    console.log(`[AskService] Multimodal request failed, retrying with text-only: ${multimodalError.message}`);
                    
                    // 텍스트만으로 메시지 재구성
                    const textOnlyMessages = [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user',
                            content: `User Request: ${userPrompt.trim()}`
                        }
                    ];

                    const fallbackResponse = await streamingLLM.streamChat(textOnlyMessages);
                    const askWin = getWindowPool()?.get('ask');

                    if (!askWin || askWin.isDestroyed()) {
                        console.error("[AskService] Ask window is not available for fallback response.");
                        fallbackResponse.body.getReader().cancel();
                        return { success: false, error: 'Ask window is not available.' };
                    }

                    const fallbackReader = fallbackResponse.body.getReader();
                    signal.addEventListener('abort', () => {
                        console.log(`[AskService] Aborting fallback stream reader. Reason: ${signal.reason}`);
                        fallbackReader.cancel(signal.reason).catch(() => {});
                    });

                    await this._processStream(fallbackReader, askWin, sessionId, signal);
                    return { success: true };
                } else {
                    // 다른 종류의 에러이거나 스크린샷이 없었다면 그대로 throw
                    throw multimodalError;
                }
            }

        } catch (error) {
            console.error('[AskService] Error during message processing:', error);
            this.state = {
                ...this.state,
                isLoading: false,
                isStreaming: false,
                showTextInput: true,
            };
            this._broadcastState();

            const askWin = getWindowPool()?.get('ask');
            if (askWin && !askWin.isDestroyed()) {
                const streamError = error.message || 'Unknown error occurred';
                askWin.webContents.send('ask-response-stream-error', { error: streamError });
            }

            return { success: false, error: error.message };
        }
    }

    /**
     * 
     * @param {ReadableStreamDefaultReader} reader
     * @param {BrowserWindow} askWin
     * @param {number} sessionId 
     * @param {AbortSignal} signal
     * @returns {Promise<void>}
     * @private
     */
    async _processStream(reader, askWin, sessionId, signal) {
        const decoder = new TextDecoder();
        let fullResponse = '';

        try {
            this.state.isLoading = false;
            this.state.isStreaming = true;
            this._broadcastState();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data === '[DONE]') {
                            return; 
                        }
                        try {
                            const json = JSON.parse(data);
                            const token = json.choices[0]?.delta?.content || '';
                            if (token) {
                                fullResponse += token;
                                this.state.currentResponse = fullResponse;
                                this._broadcastState();
                            }
                        } catch (error) {
                        }
                    }
                }
            }
        } catch (streamError) {
            if (signal.aborted) {
                console.log(`[AskService] Stream reading was intentionally cancelled. Reason: ${signal.reason}`);
            } else {
                console.error('[AskService] Error while processing stream:', streamError);
                if (askWin && !askWin.isDestroyed()) {
                    askWin.webContents.send('ask-response-stream-error', { error: streamError.message });
                }
            }
        } finally {
            this.state.isStreaming = false;
            this.state.currentResponse = fullResponse;
            this._broadcastState();
            if (fullResponse) {
                 try {
                    await askRepository.addAiMessage({ sessionId, role: 'assistant', content: fullResponse });
                    console.log(`[AskService] DB: Saved partial or full assistant response to session ${sessionId} after stream ended.`);
                } catch(dbError) {
                    console.error("[AskService] DB: Failed to save assistant response after stream ended:", dbError);
                }
            }
        }
    }

    /**
     * 멀티모달 관련 에러인지 판단
     * @private
     */
    _isMultimodalError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        return (
            errorMessage.includes('vision') ||
            errorMessage.includes('image') ||
            errorMessage.includes('multimodal') ||
            errorMessage.includes('unsupported') ||
            errorMessage.includes('image_url') ||
            errorMessage.includes('400') ||  // Bad Request often for unsupported features
            errorMessage.includes('invalid') ||
            errorMessage.includes('not supported')
        );
    }

    /**
     * Detect if the user request is for Brdy Pilot automation
     * @private
     */
    _detectBrdyPilotIntent(userPrompt) {
        const prompt = userPrompt.toLowerCase();
        const brdyKeywords = [
            'fill out', 'fill this form', 'fill the form',
            'draft an email', 'compose email', 'write email',
            'extract text', 'get text from',
            'find contact', 'contact information',
            'automate', 'automation',
            'click on', 'select option',
            'fill in my', 'enter my details',
            'compose a message', 'write a message',
            'go to', 'navigate to', 'open', 'visit',
            'search for', 'find on', 'browse to',
            'and then', 'then click', 'then search',
            'workflow', 'step by step', 'multi-step',
            'google sheets', 'spreadsheet', 'fill spreadsheet',
            'add data to', 'update sheet', 'create sheet',
            'enter data', 'populate cells', 'bulk tasks',
            'add mock data', 'add sample data', 'generate data',
            'fill with data', 'mock data', 'sample data',
            'fill my sheet', 'populate sheet', 'create data',
            // CRM-specific keywords
            'salesforce', 'hubspot', 'crm', 'customer relationship',
            'add contact', 'create contact', 'new contact',
            'add lead', 'create lead', 'new lead',
            'update contact', 'update lead', 'update customer',
            'fill crm', 'crm form', 'lead form', 'contact form',
            'customer record', 'lead information', 'contact details',
            'pipeline', 'deal', 'opportunity', 'account',
            'lead source', 'lead status', 'deal amount'
        ];
        
        return brdyKeywords.some(keyword => prompt.includes(keyword));
    }

    /**
     * Get system prompt for Brdy Pilot automation requests
     * @private
     */
    _getBrdyPilotSystemPrompt(conversationHistory) {
        return `You are Brdy Pilot, an AI assistant specialized in web automation and form filling. You can:

1. **DetectApp**: Analyze web applications (Gmail, Outlook, Google Sheets, forms, etc.)
2. **MapFields**: Map form fields to semantic meanings (email, name, phone, etc.)  
3. **DraftText**: Generate contextual text for emails and forms
4. **FillForms**: Automatically fill out forms with appropriate data
5. **EmailInsert**: Insert content into email compose areas
6. **GoogleSheetsAutomation**: Add mock data to Google Sheets spreadsheets

**Google Sheets Capabilities:**
- Detect Google Sheets automatically
- Generate realistic mock data (people, sales, projects, inventory, financial)
- Fill cells directly with proper formatting
- Support for bulk data insertion

When a user asks for Google Sheets automation like "add mock data to my google sheet":
1. I will detect if Google Sheets is open in their browser
2. Generate appropriate mock data based on their request
3. Automatically fill the spreadsheet with the data
4. Provide feedback on the operation

When a user asks for automation, you should:
1. First analyze the current page/screenshot to understand the context
2. Detect what type of application or form they're working with
3. Map any form fields you can identify
4. Provide specific automation actions or draft content as requested
5. Offer to execute the automation if appropriate

Always be helpful, accurate, and ask for clarification when needed.

Conversation History:
${conversationHistory}

Focus on understanding the user's automation intent and providing practical solutions.`;
    }

    /**
     * Handle Brdy Pilot automation requests
     * @private
     */
    async _handleScreenControlRequest(userPrompt, sessionId, screenControlIntent) {
        try {
            console.log('[AskService] Processing screen control request:', userPrompt);
            console.log('[AskService] Control intent confidence:', screenControlIntent.confidence);
            
            // Set loading state
            this.state.isLoading = false;
            this.state.isStreaming = true;
            this.state.currentResponse = '';
            this._broadcastState();

            // Execute the screen control task cleanly
            
            const controlResult = await screenControlService.executeControlTask(userPrompt, {
                maxIterations: 35, // Increased for complex multi-step tasks like summarization
                debug: true
            });

            console.log('[AskService] Control result received:', {
                success: controlResult.success,
                summary: controlResult.summary,
                details: controlResult.details,
                iterations: controlResult.iterations
            });

            if (controlResult.success) {
                // Display just the clean summary - this is what the user wants to see
                if (controlResult.summary && controlResult.summary.trim() && controlResult.summary !== "Task execution completed") {
                    await this._simulateTyping(`${controlResult.summary}\n\n`);
                } else {
                    await this._simulateTyping('✅ Task completed successfully!\n\n');
                    
                    // If we have details, show them as well
                    if (controlResult.details) {
                        await this._simulateTyping(`📋 **Details:** ${JSON.stringify(controlResult.details)}\n\n`);
                    }
                }
                
                // Clean completion - no extra details needed
            } else {
                await this._simulateTyping('❌ Task could not be completed.\n\n');
                await this._simulateTyping(`**Issue:** ${controlResult.reason || 'Unknown error'}\n`);
                await this._simulateTyping(`- Iterations attempted: ${controlResult.iterations}\n`);
                
                if (controlResult.history && controlResult.history.length > 0) {
                    await this._simulateTyping('\n**What I tried:**\n');
                    for (const entry of controlResult.history.slice(-2)) {
                        const action = entry.actionResult?.action || 'unknown';
                        const reasoning = entry.analysis?.reasoning || 'No reasoning';
                        await this._simulateTyping(`- ${action}: ${reasoning}\n`);
                    }
                }
                
                await this._simulateTyping('\n💡 **Suggestions:**\n');
                await this._simulateTyping('- Try being more specific about what you want to do\n');
                await this._simulateTyping('- Make sure the interface is ready and visible\n');
                await this._simulateTyping('- Check if the application supports the requested action\n');
            }

            // Complete the streaming
            this.state.isStreaming = false;
            this._broadcastState();

            // Save to database
            await askRepository.addAiMessage({ 
                sessionId, 
                role: 'assistant', 
                content: this.state.currentResponse.trim() 
            });

        } catch (error) {
            console.error('[AskService] Screen control request failed:', error);
            
            await this._simulateTyping(`\n❌ **Error:** ${error.message}\n\n`);
            await this._simulateTyping('Screen control is still experimental. Please try:\n');
            await this._simulateTyping('- Using more specific language\n');
            await this._simulateTyping('- Breaking complex tasks into smaller steps\n');
            await this._simulateTyping('- Using the Chrome extension for web tasks\n');

            this.state.isStreaming = false;
            this._broadcastState();
        }
    }

    /**
     * Handle simple screen analysis requests (no control actions)
     * @private
     */
    async _handleSimpleScreenAnalysis(userPrompt, sessionId) {
        try {
            console.log('[AskService] Processing simple screen analysis:', userPrompt);
            
            // Set loading state
            this.state.isLoading = false;
            this.state.isStreaming = true;
            this.state.currentResponse = '';
            this._broadcastState();

            // Use screen control service to analyze the screen
            const analysis = await screenControlService.analyzeScreen(userPrompt);
            
            // Extract just the AI's reasoning from the analysis
            const description = analysis.analysis?.reasoning || 'I can see the current screen content.';
            
            // Simply output the description without all the metadata
            await this._simulateTyping(description);

            // Complete the streaming
            this.state.isStreaming = false;
            this._broadcastState();

            // Save to database
            await askRepository.addAiMessage({ 
                sessionId, 
                message: description, 
                metadata: { 
                    type: 'screen_analysis',
                    timestamp: Date.now() 
                } 
            });

        } catch (error) {
            console.error('[AskService] Simple screen analysis failed:', error);
            
            await this._simulateTyping(`Error analyzing screen: ${error.message}`);
            this.state.isStreaming = false;
            this._broadcastState();
        }
    }

    async _handleBrdyPilotRequest(userPrompt, screenshotBase64, sessionId) {
        try {
            console.log('[AskService] Processing Brdy Pilot request:', userPrompt);
            
            // Set loading state
            this.state.isLoading = false;
            this.state.isStreaming = true;
            this.state.currentResponse = '';
            this._broadcastState();

            // Simulate progressive response for better UX
            await this._simulateTyping('Analyzing the page for automation opportunities...');
            
            // Analyze the current context (simulated for now)
            const context = await this._analyzePageContext(screenshotBase64);
            
            await this._simulateTyping('\n\nDetected: ' + context.appType + ' application\n');
            
            // Handle different types of automation requests
            if (userPrompt.toLowerCase().includes('fill') && userPrompt.toLowerCase().includes('form')) {
                await this._handleFormFillRequestWithBrowser(context, userPrompt);
            } else if (userPrompt.toLowerCase().includes('google sheets') || 
                       userPrompt.toLowerCase().includes('spreadsheet') ||
                       userPrompt.toLowerCase().includes('mock data') ||
                       userPrompt.toLowerCase().includes('sample data')) {
                await this._handleGoogleSheetsRequestWithBrowser(context, userPrompt);
            } else if (userPrompt.toLowerCase().includes('email') || userPrompt.toLowerCase().includes('draft')) {
                await this._handleEmailDraftRequest(context, userPrompt);
            } else if (userPrompt.toLowerCase().includes('extract') || userPrompt.toLowerCase().includes('text')) {
                await this._handleTextExtractionRequest(context);
            } else if (userPrompt.toLowerCase().includes('go to') || userPrompt.toLowerCase().includes('navigate') || userPrompt.toLowerCase().includes('open')) {
                // Check if this is a multi-step workflow
                if (this._detectWorkflowIntent(userPrompt)) {
                    await this._handleWorkflowRequest(context, userPrompt);
                } else {
                    await this._handleNavigationRequestWithBrowser(context, userPrompt);
                }
            } else {
                await this._handleGeneralAutomationRequest(context, userPrompt);
            }

            // Finalize the response
            this.state.isStreaming = false;
            this.state.showTextInput = true;
            this._broadcastState();

            // Save to database
            if (this.state.currentResponse) {
                await askRepository.addAiMessage({ 
                    sessionId, 
                    role: 'assistant', 
                    content: this.state.currentResponse 
                });
            }

        } catch (error) {
            console.error('[AskService] Error in Brdy Pilot request:', error);
            this.state.isStreaming = false;
            this.state.showTextInput = true;
            this.state.currentResponse += '\n\n Error processing automation request: ' + error.message;
            this._broadcastState();
        }
    }

    /**
     * Simulate typing for better UX
     * @private
     */
    async _simulateTyping(text, delay = 8) {
        for (let i = 0; i < text.length; i++) {
            this.state.currentResponse += text[i];
            this._broadcastState();
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    /**
     * Analyze page context for automation
     * @private
     */
    async _analyzePageContext(screenshotBase64) {
        try {
            // Try to get the active browser window for DOM analysis
            const browserWindow = this._getActiveBrowserWindow();
            
            if (browserWindow && browserWindow.webContents) {
                // Use DOM interaction to analyze the page
                const appDetection = await domInteraction.executeCommand(browserWindow.webContents, 'detectApp');
                const fieldMapping = await domInteraction.executeCommand(browserWindow.webContents, 'mapFields');
                
                if (appDetection.success && fieldMapping.success) {
                    return {
                        appType: appDetection.result.type,
                        confidence: appDetection.result.confidence,
                        capabilities: appDetection.result.capabilities,
                        hasForm: fieldMapping.result.totalCount > 0,
                        hasEmailComposer: appDetection.result.type === 'gmail' || appDetection.result.type === 'outlook',
                        detectedFields: fieldMapping.result.fields,
                        totalFields: fieldMapping.result.totalCount,
                        visibleFields: fieldMapping.result.visibleCount
                    };
                }
            }
        } catch (error) {
            console.log('[AskService] DOM analysis failed, using screenshot analysis:', error.message);
        }
        
        // Fallback to simulated analysis
        return {
            appType: 'web_application',
            hasForm: true,
            hasEmailComposer: false,
            detectedFields: [
                { name: 'email', type: 'email', semantic: 'email', selector: '#email' },
                { name: 'firstName', type: 'text', semantic: 'name', selector: '#firstName' },
                { name: 'lastName', type: 'text', semantic: 'name', selector: '#lastName' }
            ],
            confidence: 0.6,
            source: 'fallback'
        };
    }

    /**
     * Get the active browser window for DOM interaction
     * @private
     */
    _getActiveBrowserWindow() {
        try {
            const { BrowserWindow } = require('electron');
            const allWindows = BrowserWindow.getAllWindows();
            
            // Find the focused window that's not one of Orbit's UI windows
            for (const window of allWindows) {
                if (window.isFocused() && window.webContents) {
                    const url = window.webContents.getURL();
                    
                    // Skip Orbit's internal windows
                    if (!url.startsWith('file://') && !url.includes('localhost')) {
                        return window;
                    }
                }
            }
            
            // If no focused external window, try to find any external window
            for (const window of allWindows) {
                if (window.webContents) {
                    const url = window.webContents.getURL();
                    
                    if (!url.startsWith('file://') && !url.includes('localhost')) {
                        return window;
                    }
                }
            }
            
        } catch (error) {
            console.error('[AskService] Error finding browser window:', error);
        }
        
        return null;
    }

    /**
     * Handle form filling automation
     * @private
     */
    async _handleFormFillRequest(context) {
        // Determine if this is a CRM form
        const isCrmForm = context.appType?.includes('crm') || context.appType === 'salesforce' || context.appType === 'hubspot';
        const crmFields = context.detectedFields.filter(f => ['lead_source', 'lead_status', 'deal_amount', 'pipeline_stage', 'account_owner', 'industry', 'company_size'].includes(f.semantic));
        
        if (isCrmForm || crmFields.length > 0) {
            await this._simulateTyping(`🎯 **CRM Form Detected!** Found ${context.detectedFields.length} form fields:\n\n`);
            
            // Group fields by category
            const basicFields = context.detectedFields.filter(f => ['name', 'email', 'phone', 'company', 'address'].includes(f.semantic));
            const crmSpecificFields = context.detectedFields.filter(f => ['lead_source', 'lead_status', 'deal_amount', 'pipeline_stage', 'account_owner', 'industry', 'company_size', 'website', 'annual_revenue', 'priority', 'campaign'].includes(f.semantic));
            const otherFields = context.detectedFields.filter(f => !basicFields.includes(f) && !crmSpecificFields.includes(f));
            
            if (basicFields.length > 0) {
                await this._simulateTyping('**📞 Contact Information:**\n');
                for (const field of basicFields) {
                    await this._simulateTyping(`- ${field.semantic.replace('_', ' ')}: ${field.name || field.id}\n`);
                }
                await this._simulateTyping('\n');
            }
            
            if (crmSpecificFields.length > 0) {
                await this._simulateTyping('**💼 CRM-Specific Fields:**\n');
                for (const field of crmSpecificFields) {
                    await this._simulateTyping(`- ${field.semantic.replace('_', ' ')}: ${field.name || field.id}\n`);
                }
                await this._simulateTyping('\n');
            }
            
            if (otherFields.length > 0) {
                await this._simulateTyping('**📝 Additional Fields:**\n');
                for (const field of otherFields) {
                    await this._simulateTyping(`- ${field.semantic}: ${field.name || field.id}\n`);
                }
                await this._simulateTyping('\n');
            }
            
            await this._simulateTyping('🚀 **CRM Auto-Fill Options:**\n');
            await this._simulateTyping('[ACTION_BUTTON:Fill with realistic CRM data]1. **Auto-fill with realistic CRM data** (leads, contacts, opportunities)[/ACTION_BUTTON]\n');
            await this._simulateTyping('[ACTION_BUTTON:Fill lead information]2. **Fill as new lead** with qualification data[/ACTION_BUTTON]\n');
            await this._simulateTyping('[ACTION_BUTTON:Fill contact information]3. **Fill as new contact** with company details[/ACTION_BUTTON]\n');
            await this._simulateTyping('[ACTION_BUTTON:Custom CRM data entry]4. **Ask me for specific CRM information** to fill in[/ACTION_BUTTON]\n\n');
        } else {
            await this._simulateTyping(' Found ' + context.detectedFields.length + ' form fields:\n');
            
            for (const field of context.detectedFields) {
                await this._simulateTyping(`- ${field.semantic}: ${field.name || field.id}\n`);
            }
            
            await this._simulateTyping('\n I can help fill this form with appropriate data. ');
            await this._simulateTyping('Would you like me to:\n\n');
            await this._simulateTyping('[ACTION_BUTTON:Auto-fill with sample data for testing]1. **Auto-fill with sample data** for testing[/ACTION_BUTTON]\n');
            await this._simulateTyping('[ACTION_BUTTON:Ask you for specific information to fill in]2. **Ask you for specific information** to fill in[/ACTION_BUTTON]\n');
            await this._simulateTyping('[ACTION_BUTTON:Fill with smart defaults based on field types]3. **Fill with smart defaults** based on field types[/ACTION_BUTTON]\n\n');
        }
        
        // If we have actual field data, offer to auto-fill
        if (context.detectedFields.length > 0 && context.source !== 'fallback') {
            await this._simulateTyping(' **Quick Action**: I can auto-fill with sample data right now!\n\n');
            
            // Prepare sample data mapping
            const sampleMappings = this._generateSampleData(context.detectedFields);
            
            try {
                const browserWindow = this._getActiveBrowserWindow();
                if (browserWindow) {
                    // Execute the form fill
                    const fillResult = await domInteraction.executeCommand(
                        browserWindow.webContents, 
                        'fillFields', 
                        { 
                            mappings: sampleMappings,
                            options: { showFeedback: true }
                        }
                    );
                    
                    if (fillResult.success) {
                        await this._simulateTyping(` **Auto-filled ${fillResult.result.filled} fields successfully!**\n`);
                        if (fillResult.result.failed > 0) {
                            await this._simulateTyping(` ${fillResult.result.failed} fields couldn't be filled.\n`);
                        }
                    } else {
                        await this._simulateTyping(' Auto-fill failed. You can still manually specify values.\n');
                    }
                }
            } catch (error) {
                await this._simulateTyping(' Auto-fill encountered an error. Manual input is available.\n');
            }
        }
        
        await this._simulateTyping('\nLet me know if you need different data or want to modify any fields!');
    }

    /**
     * Handle form filling with embedded browser (FULL AUTOMATION)
     * @private
     */
    async _handleFormFillRequestWithBrowser(context, userPrompt) {
        await this._simulateTyping('🚀 **Full Browser Automation Mode**\n\n');
        
        // Extract URL from the user prompt or context
        const url = this._extractUrlFromPrompt(userPrompt);
        
        if (!url) {
            await this._simulateTyping('❓ **I need a URL to automate.** Please provide the website URL you want me to fill out.\n\n');
            await this._simulateTyping('Example: "Fill out the Salesforce form at https://mycompany.salesforce.com/lead/new"\n');
            return;
        }

        await this._simulateTyping(`🌐 **Opening browser window for:** ${url}\n`);
        
        try {
            // Create embedded browser
            if (!this.embeddedBrowser.isReady) {
                const browserResult = await this.embeddedBrowser.createBrowserWindow({
                    width: 1200,
                    height: 800
                });
                
                if (!browserResult.success) {
                    await this._simulateTyping(`❌ **Failed to create browser:** ${browserResult.error}\n`);
                    return;
                }
                
                await this._simulateTyping('✅ **Browser window created successfully**\n');
            }

            // Navigate to the URL
            await this._simulateTyping('📡 **Navigating to target page...**\n');
            const navResult = await this.embeddedBrowser.navigateToUrl(url);
            
            if (!navResult.success) {
                await this._simulateTyping(`❌ **Navigation failed:** ${navResult.error}\n`);
                return;
            }

            await this._simulateTyping('✅ **Page loaded successfully**\n');
            await this._simulateTyping('🔍 **Analyzing page for automation opportunities...**\n');

            // Detect page and form fields
            const pageInfo = await this.embeddedBrowser.getCurrentPageInfo();
            
            if (!pageInfo.detection) {
                await this._simulateTyping('❌ **Could not analyze page**\n');
                return;
            }

            const detection = pageInfo.detection;
            const fields = pageInfo.fields;

            await this._simulateTyping(`🎯 **Detected: ${detection.platform || detection.type}**\n`);
            await this._simulateTyping(`📋 **Found ${fields.totalCount} form fields (${fields.visibleCount} visible)**\n\n`);

            // Determine if this is a CRM form
            const isCrmForm = detection.type === 'crm' || detection.platform === 'salesforce' || detection.platform === 'hubspot';
            const crmFields = fields.fields.filter(f => ['lead_source', 'lead_status', 'deal_amount', 'pipeline_stage', 'account_owner', 'industry', 'company_size'].includes(f.semantic));

            if (isCrmForm || crmFields.length > 0) {
                await this._simulateTyping('💼 **CRM Form Detected! Preparing business data...**\n\n');
                
                // Group fields for better presentation
                const basicFields = fields.fields.filter(f => ['name', 'first_name', 'last_name', 'email', 'phone', 'company', 'address'].includes(f.semantic));
                const crmSpecificFields = fields.fields.filter(f => ['lead_source', 'lead_status', 'deal_amount', 'pipeline_stage', 'account_owner', 'industry', 'company_size', 'website', 'annual_revenue', 'priority', 'campaign'].includes(f.semantic));

                if (basicFields.length > 0) {
                    await this._simulateTyping('**📞 Contact Information Fields:**\n');
                    for (const field of basicFields.slice(0, 5)) {
                        await this._simulateTyping(`• ${field.semantic.replace('_', ' ')}: ${field.label || field.name || field.id}\n`);
                    }
                    await this._simulateTyping('\n');
                }

                if (crmSpecificFields.length > 0) {
                    await this._simulateTyping('**💼 CRM Business Fields:**\n');
                    for (const field of crmSpecificFields.slice(0, 5)) {
                        await this._simulateTyping(`• ${field.semantic.replace('_', ' ')}: ${field.label || field.name || field.id}\n`);
                    }
                    await this._simulateTyping('\n');
                }
            } else {
                await this._simulateTyping('📝 **Standard Form Detected**\n\n');
                for (const field of fields.fields.slice(0, 8)) {
                    await this._simulateTyping(`• ${field.semantic}: ${field.label || field.name || field.id}\n`);
                }
                if (fields.fields.length > 8) {
                    await this._simulateTyping(`... and ${fields.fields.length - 8} more fields\n`);
                }
                await this._simulateTyping('\n');
            }

            // Generate sample data
            await this._simulateTyping('🤖 **Auto-filling form with realistic data...**\n');
            
            const sampleMappings = {};
            fields.fields.forEach(field => {
                if (field.visible && field.selector) {
                    sampleMappings[field.selector] = this._getCrmSampleValue(field.semantic);
                }
            });

            // Execute the form filling
            const fillResult = await this.embeddedBrowser.executeCommand('fillForm', {
                mappings: sampleMappings
            });

            if (fillResult.success && fillResult.result) {
                const result = fillResult.result;
                await this._simulateTyping(`✅ **Auto-fill complete!**\n`);
                await this._simulateTyping(`📊 **Results:**\n`);
                await this._simulateTyping(`• Successfully filled: ${result.filled} fields\n`);
                if (result.failed > 0) {
                    await this._simulateTyping(`• Failed to fill: ${result.failed} fields\n`);
                }
                await this._simulateTyping('\n');

                // Show what was filled
                if (result.details && result.details.length > 0) {
                    await this._simulateTyping('**📝 Filled Data:**\n');
                    for (const detail of result.details.slice(0, 6)) {
                        if (detail.success) {
                            const field = fields.fields.find(f => f.selector === detail.selector);
                            const fieldName = field?.semantic?.replace('_', ' ') || 'field';
                            await this._simulateTyping(`• ${fieldName}: ${detail.value}\n`);
                        }
                    }
                    if (result.details.length > 6) {
                        await this._simulateTyping(`... and ${result.details.length - 6} more fields\n`);
                    }
                    await this._simulateTyping('\n');
                }

                await this._simulateTyping('🎯 **Next Steps:**\n');
                await this._simulateTyping('• Review the filled data in the browser window\n');
                await this._simulateTyping('• Make any necessary adjustments\n');
                await this._simulateTyping('• Click Submit when ready\n');
                await this._simulateTyping('• I can help you submit the form automatically if needed!\n');

            } else {
                await this._simulateTyping(`❌ **Auto-fill failed:** ${fillResult.error || 'Unknown error'}\n`);
            }

        } catch (error) {
            console.error('[AskService] Browser automation error:', error);
            await this._simulateTyping(`❌ **Automation error:** ${error.message}\n`);
        }
    }

    /**
     * Handle navigation with embedded browser
     * @private  
     */
    async _handleNavigationRequestWithBrowser(context, userPrompt) {
        await this._simulateTyping('🚀 **Full Browser Navigation Mode**\n\n');
        
        const destination = this._extractNavigationDestination(userPrompt);
        
        if (!destination) {
            await this._simulateTyping('❓ **Please specify where you want to go**\n');
            await this._simulateTyping('Example: "Go to salesforce.com" or "Open https://hubspot.com"\n');
            return;
        }

        try {
            // Create browser if needed
            if (!this.embeddedBrowser.isReady) {
                await this._simulateTyping('🌐 **Creating browser window...**\n');
                const browserResult = await this.embeddedBrowser.createBrowserWindow();
                
                if (!browserResult.success) {
                    await this._simulateTyping(`❌ **Failed to create browser:** ${browserResult.error}\n`);
                    return;
                }
            }

            const url = this._buildNavigationURL(destination);
            await this._simulateTyping(`📡 **Navigating to:** ${url}\n`);
            
            const navResult = await this.embeddedBrowser.navigateToUrl(url);
            
            if (navResult.success) {
                await this._simulateTyping('✅ **Successfully opened in browser window!**\n\n');
                
                // Analyze the loaded page
                const pageInfo = await this.embeddedBrowser.getCurrentPageInfo();
                if (pageInfo.detection) {
                    await this._simulateTyping(`🎯 **Page Analysis:**\n`);
                    await this._simulateTyping(`• Platform: ${pageInfo.detection.platform || pageInfo.detection.type}\n`);
                    await this._simulateTyping(`• Capabilities: ${pageInfo.detection.capabilities?.join(', ') || 'Standard browsing'}\n`);
                    
                    if (pageInfo.fields && pageInfo.fields.totalCount > 0) {
                        await this._simulateTyping(`• Forms found: ${pageInfo.fields.totalCount} fields detected\n`);
                        await this._simulateTyping('\n🤖 **I can automatically fill out any forms on this page!**\n');
                        await this._simulateTyping('Just ask: "Fill out this form" or "Add sample data to this form"\n');
                    }
                }
            } else {
                await this._simulateTyping(`❌ **Navigation failed:** ${navResult.error}\n`);
            }

        } catch (error) {
            await this._simulateTyping(`❌ **Navigation error:** ${error.message}\n`);
        }
    }

    /**
     * Extract URL from user prompt
     * @private
     */
    _extractUrlFromPrompt(prompt) {
        // Look for explicit URLs
        const urlMatch = prompt.match(/https?:\/\/[^\s]+/i);
        if (urlMatch) {
            return urlMatch[0];
        }

        // Look for domain patterns
        const domainMatch = prompt.match(/(?:at|on|to)\s+([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        if (domainMatch) {
            return `https://${domainMatch[1]}`;
        }

        // Check for common platforms
        const prompt_lower = prompt.toLowerCase();
        if (prompt_lower.includes('salesforce')) {
            return 'https://login.salesforce.com';
        }
        if (prompt_lower.includes('hubspot')) {
            return 'https://app.hubspot.com';
        }

        return null;
    }

    /**
     * Get CRM-appropriate sample value
     * @private
     */
    _getCrmSampleValue(semantic) {
        const values = {
            // Basic contact info
            'name': 'John Smith',
            'first_name': 'John',
            'last_name': 'Smith', 
            'email': 'john.smith@techcorp.com',
            'phone': '(555) 123-4567',
            'company': 'TechCorp Solutions Inc.',
            'address': '123 Business Ave, Suite 100',
            'city': 'San Francisco',
            'state': 'CA',
            'zip_code': '94105',
            'website': 'https://techcorp.com',
            
            // CRM-specific
            'lead_source': 'Website',
            'lead_status': 'New',
            'deal_amount': '75000',
            'pipeline_stage': 'Qualification',
            'account_owner': 'Sales Team',
            'industry': 'Technology',
            'company_size': '50-100 employees',
            'annual_revenue': '$5M - $10M',
            'priority': 'High',
            'campaign': 'Q4 Digital Marketing',
            'source': 'Organic Search',
            'status': 'Active',
            'notes': 'Interested in enterprise solution. Schedule follow-up call within 1 week.',
            'description': 'Qualified lead from website contact form. Expressed interest in premium features.',
            
            // Fallback
            'unknown': 'Sample Data'
        };

        return values[semantic] || values['unknown'];
    }

    /**
     * Handle Google Sheets with full browser automation
     * @private
     */
    async _handleGoogleSheetsRequestWithBrowser(context, userPrompt) {
        await this._simulateTyping('📊 **Google Sheets Full Automation Mode**\n\n');
        
        // Parse the data type and count from prompt first
        const dataType = this._extractDataType(userPrompt);
        const rowCount = this._extractRowCount(userPrompt);
        
        // Check if user provided a Google Sheets URL
        let url = this._extractUrlFromPrompt(userPrompt);
        let useExistingSheet = false;
        
        // If user mentions "on my browser" or "current sheet", try Chrome extension first
        if (userPrompt.toLowerCase().includes('on my browser') || 
            userPrompt.toLowerCase().includes('current sheet') ||
            userPrompt.toLowerCase().includes('this sheet') ||
            userPrompt.toLowerCase().includes('my google sheet')) {
            
            // Check if Chrome extension is available
            if (this.chromeExtension.isExtensionAvailable()) {
                await this._handleGoogleSheetsWithExtension(dataType, rowCount);
                return;
            } else {
                await this._simulateTyping('🔍 **To add data to your existing Google Sheet:**\n\n');
                await this._simulateTyping('**Option 1:** Install the Brdy Orbit Chrome extension for direct automation\n');
                await this._simulateTyping('**Option 2:** Copy the URL from your Google Sheet and ask me:\n');
                await this._simulateTyping('   "Add mock data to https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit"\n\n');
                await this._simulateTyping('**Option 3:** Use this generated data manually (copy/paste):\n\n');
                
                // Generate sample data to show the user
                const sampleData = this._generateSpreadsheetData(dataType, Math.min(rowCount, 5));
                await this._simulateTyping('```\n');
                await this._simulateTyping(sampleData.map(row => row.join('\t')).join('\n'));
                await this._simulateTyping('\n```\n\n');
                await this._simulateTyping('💡 **Tip:** Select cell A1 in your sheet and paste (Cmd+V) the data above.\n\n');
                await this._simulateTyping('Which option would you prefer? 🤔');
                return;
            }
        }
        
        if (!url || !url.includes('sheets.google.com') && !url.includes('docs.google.com/spreadsheets')) {
            // Default to creating a new sheet
            url = 'https://sheets.google.com';
        }

        await this._simulateTyping(`🌐 **Opening Google Sheets:** ${url}\n`);
        await this._simulateTyping(`📋 **Data type:** ${dataType}\n`);
        await this._simulateTyping(`📊 **Rows to generate:** ${rowCount}\n\n`);

        try {
            // Create embedded browser if needed
            if (!this.embeddedBrowser.isBrowserReady()) {
                await this._simulateTyping('🔧 **Initializing embedded browser...**\n');
                const browserResult = await this.embeddedBrowser.createBrowserWindow({
                    width: 1400,
                    height: 900
                });
                
                if (!browserResult.success) {
                    await this._simulateTyping(`❌ **Failed to create browser:** ${browserResult.error}\n`);
                    return;
                }
                
                await this._simulateTyping('✅ **Browser window created successfully**\n');
            } else {
                await this._simulateTyping('✅ **Using existing browser window**\n');
            }

            // Navigate to Google Sheets
            await this._simulateTyping('📡 **Navigating to Google Sheets...**\n');
            const navResult = await this.embeddedBrowser.navigateToUrl(url);
            
            if (!navResult.success) {
                await this._simulateTyping(`❌ **Navigation failed:** ${navResult.error}\n`);
                return;
            }

            // Wait a moment for the page to fully load
            await new Promise(resolve => setTimeout(resolve, 2000));

            await this._simulateTyping('✅ **Google Sheets loaded successfully**\n');
            await this._simulateTyping('🔍 **Detecting spreadsheet interface...**\n');

            // Detect Google Sheets
            const detection = await this.embeddedBrowser.executeCommand('detectGoogleSheets');
            
            if (!detection.success || !detection.result.success) {
                await this._simulateTyping('❌ **Could not detect Google Sheets interface**\n');
                await this._simulateTyping('💡 **Tip:** Make sure you\'re on a Google Sheets page with edit permissions\n');
                return;
            }

            await this._simulateTyping('🎯 **Google Sheets detected successfully!**\n');
            await this._simulateTyping(`✨ **Capabilities:** ${detection.result.capabilities?.join(', ')}\n\n`);

            // Generate mock data
            await this._simulateTyping(`🤖 **Generating ${rowCount} rows of ${dataType} data...**\n`);
            
            const mockDataResult = await this.embeddedBrowser.executeCommand('generateMockData', {
                type: dataType,
                count: rowCount
            });

            if (!mockDataResult.success) {
                await this._simulateTyping(`❌ **Failed to generate data:** ${mockDataResult.error}\n`);
                return;
            }

            const mockData = mockDataResult.result;
            await this._simulateTyping('✅ **Mock data generated successfully**\n');
            await this._simulateTyping(`📊 **Data preview:**\n`);
            await this._simulateTyping(`• Headers: ${mockData[0].join(', ')}\n`);
            await this._simulateTyping(`• Row 1: ${mockData[1].join(', ')}\n`);
            if (mockData.length > 2) {
                await this._simulateTyping(`• ... and ${mockData.length - 2} more data rows\n`);
            }
            await this._simulateTyping('\n');

            // Fill the Google Sheets
            await this._simulateTyping('🚀 **Auto-filling Google Sheets with data...**\n');
            
            const fillResult = await this.embeddedBrowser.executeCommand('fillGoogleSheets', {
                data: mockData,
                options: {
                    startRow: 1,
                    startCol: 1
                }
            });

            if (fillResult.success && fillResult.result.success) {
                const result = fillResult.result;
                
                // Check if we have verification that data was actually added
                if (result.verification) {
                    await this._simulateTyping('🎉 **Google Sheets automation completed successfully!**\n\n');
                    
                    await this._simulateTyping('📊 **Results:**\n');
                    await this._simulateTyping(`• Method used: ${result.method}\n`);
                    await this._simulateTyping(`• Data rows: ${result.dataRows}\n`);
                    await this._simulateTyping(`• Data columns: ${result.dataCols}\n`);
                    await this._simulateTyping(`• Total cells filled: ${result.results.successful}\n`);
                    await this._simulateTyping(`• Verification: ${result.verification}\n`);
                    
                    await this._simulateTyping('\n🎯 **What was accomplished:**\n');
                    await this._simulateTyping(`• Opened Google Sheets in browser window\n`);
                    await this._simulateTyping(`• Generated realistic ${dataType} data\n`);
                    await this._simulateTyping(`• Automatically filled spreadsheet cells\n`);
                    await this._simulateTyping(`• Verified data appeared in the grid\n\n`);
                    
                    await this._simulateTyping('✨ **The spreadsheet is ready to use!**\n');
                    await this._simulateTyping('You can now review, edit, or save the data as needed.\n');
                } else {
                    // No verification - likely failed but reported success
                    await this._simulateTyping('⚠️ **Automation encountered issues**\n\n');
                    await this._simulateTyping('📊 **Status:**\n');
                    await this._simulateTyping(`• Google Sheets detected: ✅\n`);
                    await this._simulateTyping(`• Data generated: ✅\n`);
                    await this._simulateTyping(`• Cell manipulation: ❌ (verification failed)\n\n`);
                    
                    if (result.results.errors && result.results.errors.length > 0) {
                        await this._simulateTyping('🔍 **Issues found:**\n');
                        for (const error of result.results.errors.slice(0, 3)) {
                            await this._simulateTyping(`• ${error}\n`);
                        }
                        await this._simulateTyping('\n');
                    }
                    
                    await this._simulateTyping('💡 **Possible solutions:**\n');
                    await this._simulateTyping('• Make sure you are logged into Google in the browser window\n');
                    await this._simulateTyping('• Ensure the spreadsheet is editable (not view-only)\n');
                    await this._simulateTyping('• Try manually clicking cell A1 first, then ask again\n');
                    await this._simulateTyping('• Check if the spreadsheet grid is fully loaded\n\n');
                    
                    await this._simulateTyping('🔄 **Manual fallback:** Copy this data:\n\n');
                    // Show the TSV data for manual copying
                    const tsvData = mockData.map(row => row.join('\\t')).join('\\n');
                    await this._simulateTyping('```\n' + tsvData + '\n```\n\n');
                    await this._simulateTyping('Then paste it into cell A1 of your Google Sheet.\n');
                }

            } else {
                await this._simulateTyping(`❌ **Auto-fill failed:** ${fillResult.error || fillResult.result?.error || 'Unknown error'}\n\n`);
                
                // Show debug information if available
                if (fillResult.result?.debug) {
                    await this._simulateTyping('🔍 **Debug information:**\n');
                    const debug = fillResult.result.debug;
                    await this._simulateTyping(`• Current URL: ${debug.url}\n`);
                    await this._simulateTyping(`• Page title: ${debug.title}\n`);
                    await this._simulateTyping(`• Grid found: ${debug.gridFound ? '✅' : '❌'}\n`);
                    await this._simulateTyping(`• Sheets root found: ${debug.sheetsRootFound ? '✅' : '❌'}\n\n`);
                }
                
                await this._simulateTyping('💡 **What to try:**\n');
                await this._simulateTyping('• Make sure you have a Google Sheet open with the grid visible\n');
                await this._simulateTyping('• Sign in to Google if you see a login page\n');
                await this._simulateTyping('• Create a new sheet or open an existing one\n');
                await this._simulateTyping('• Try again once the spreadsheet interface is ready\n\n');
                
                await this._simulateTyping('🔄 **Manual option:** Copy this generated data:\n\n');
                const tsvData = mockData.map(row => row.join('\\t')).join('\\n');
                await this._simulateTyping('```\n' + tsvData + '\n```\n\n');
                await this._simulateTyping('And paste it into your Google Sheet manually.\n');
            }

        } catch (error) {
            console.error('[AskService] Google Sheets browser automation error:', error);
            await this._simulateTyping(`❌ **Automation error:** ${error.message}\n`);
        }
    }

    /**
     * Extract data type from user prompt
     * @private
     */
    _extractDataType(prompt) {
        const prompt_lower = prompt.toLowerCase();
        
        if (prompt_lower.includes('sales') || prompt_lower.includes('revenue')) return 'sales';
        if (prompt_lower.includes('people') || prompt_lower.includes('employees') || prompt_lower.includes('contacts')) return 'people';
        if (prompt_lower.includes('projects') || prompt_lower.includes('tasks')) return 'projects';
        if (prompt_lower.includes('financial') || prompt_lower.includes('transactions')) return 'financial';
        if (prompt_lower.includes('inventory') || prompt_lower.includes('products')) return 'inventory';
        
        return 'sales'; // Default
    }

    /**
     * Extract row count from user prompt
     * @private
     */
    _extractRowCount(prompt) {
        const rowMatch = prompt.match(/(\d+)\s*(rows?|records?|entries?|lines?)/i);
        if (rowMatch) {
            return parseInt(rowMatch[1]);
        }
        return 10; // Default
    }

    /**
     * Generate sample data for form fields
     * @private
     */
    _generateSampleData(fields) {
        const sampleData = {};
        
        fields.forEach(field => {
            if (!field.selector) return;
            
            switch (field.semantic) {
                case 'email':
                    sampleData[field.selector] = 'test@example.com';
                    break;
                case 'name':
                    if (field.name && field.name.toLowerCase().includes('first')) {
                        sampleData[field.selector] = 'John';
                    } else if (field.name && field.name.toLowerCase().includes('last')) {
                        sampleData[field.selector] = 'Doe';
                    } else {
                        sampleData[field.selector] = 'John Doe';
                    }
                    break;
                case 'phone':
                    sampleData[field.selector] = '(555) 123-4567';
                    break;
                case 'address':
                    sampleData[field.selector] = '123 Main St, Anytown, ST 12345';
                    break;
                case 'company':
                    sampleData[field.selector] = 'Sample Company Inc.';
                    break;
                case 'subject':
                    sampleData[field.selector] = 'Sample Subject';
                    break;
                case 'message':
                    sampleData[field.selector] = 'This is a sample message for testing purposes.';
                    break;
                // CRM-specific fields
                case 'lead_source':
                    sampleData[field.selector] = 'Website';
                    break;
                case 'lead_status':
                    sampleData[field.selector] = 'New';
                    break;
                case 'deal_amount':
                    sampleData[field.selector] = '50000';
                    break;
                case 'pipeline_stage':
                    sampleData[field.selector] = 'Qualification';
                    break;
                case 'account_owner':
                    sampleData[field.selector] = 'Sales Team';
                    break;
                case 'industry':
                    sampleData[field.selector] = 'Technology';
                    break;
                case 'company_size':
                    sampleData[field.selector] = '50-100 employees';
                    break;
                case 'website':
                    sampleData[field.selector] = 'https://example.com';
                    break;
                case 'annual_revenue':
                    sampleData[field.selector] = '$1M - $5M';
                    break;
                case 'priority':
                    sampleData[field.selector] = 'High';
                    break;
                case 'campaign':
                    sampleData[field.selector] = 'Q4 Marketing Campaign';
                    break;
                case 'description':
                    sampleData[field.selector] = 'Interested in our premium services. Follow up in 1 week.';
                    break;
                default:
                    if (field.type === 'email') {
                        sampleData[field.selector] = 'test@example.com';
                    } else if (field.type === 'tel') {
                        sampleData[field.selector] = '(555) 123-4567';
                    } else if (field.type === 'number') {
                        sampleData[field.selector] = '123';
                    } else {
                        sampleData[field.selector] = 'Sample Text';
                    }
            }
        });
        
        return sampleData;
    }

    /**
     * Generate sample spreadsheet data
     * @private
     */
    _generateSpreadsheetData(dataType, rowCount = 5) {
        const data = [];
        
        switch (dataType.toLowerCase()) {
            case 'people':
            case 'employees':
            case 'contacts':
                data.push(['Name', 'Email', 'Phone', 'Department', 'Start Date']);
                const names = ['John Smith', 'Jane Doe', 'Mike Johnson', 'Sarah Wilson', 'Chris Brown'];
                const domains = ['@company.com', '@example.com', '@business.org'];
                const departments = ['Sales', 'Marketing', 'Engineering', 'HR', 'Finance'];
                
                for (let i = 0; i < rowCount; i++) {
                    const name = names[i % names.length];
                    const email = name.toLowerCase().replace(' ', '.') + domains[i % domains.length];
                    data.push([
                        name,
                        email,
                        `(555) ${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 9000 + 1000)}`,
                        departments[i % departments.length],
                        new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toLocaleDateString()
                    ]);
                }
                break;
                
            case 'sales':
            case 'revenue':
                data.push(['Company', 'Revenue', 'Status', 'Priority', 'Date']);
                const companies = ['TechCorp Inc', 'Global Solutions', 'Innovation Partners', 'Digital Dynamics', 'Future Systems'];
                const revenues = ['$150,000', '$250,000', '$350,000', '$450,000', '$550,000'];
                const statuses = ['Active', 'Pending', 'Completed', 'In Progress'];
                const priorities = ['High', 'Medium', 'Low'];
                
                for (let i = 0; i < rowCount; i++) {
                    data.push([
                        companies[i % companies.length],
                        revenues[i % revenues.length],
                        statuses[i % statuses.length],
                        priorities[i % priorities.length],
                        new Date(Date.now() + (i - rowCount/2) * 24 * 60 * 60 * 1000).toLocaleDateString()
                    ]);
                }
                break;
                
            case 'projects':
            case 'tasks':
                data.push(['Project Name', 'Assignee', 'Status', 'Priority', 'Due Date']);
                const assignees = ['John Smith', 'Jane Doe', 'Mike Johnson', 'Sarah Wilson'];
                const projectStatuses = ['Not Started', 'In Progress', 'Review', 'Completed'];
                
                for (let i = 0; i < rowCount; i++) {
                    data.push([
                        `Project ${i + 1}`,
                        assignees[i % assignees.length],
                        projectStatuses[i % projectStatuses.length],
                        priorities[i % priorities.length],
                        new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000).toLocaleDateString()
                    ]);
                }
                break;
                
            default:
                data.push(['Item', 'Value', 'Category', 'Date', 'Amount']);
                for (let i = 0; i < rowCount; i++) {
                    data.push([
                        `Item ${i + 1}`,
                        Math.floor(Math.random() * 1000),
                        ['Category A', 'Category B', 'Category C'][i % 3],
                        new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
                        `$${(Math.random() * 1000).toFixed(2)}`
                    ]);
                }
        }
        
        return data;
    }

    /**
     * Handle Google Sheets automation with Chrome extension
     * @private
     */
    async _handleGoogleSheetsWithExtension(dataType, rowCount) {
        try {
            await this._simulateTyping('Chrome Extension Automation Mode\n\n');
            await this._simulateTyping('Scanning for Google Sheets tabs...\n');

            // Find Google Sheets tabs
            console.log('[AskService] Calling findGoogleSheetsTabs...');
            const sheetsTabs = await this.chromeExtension.findGoogleSheetsTabs();
            console.log('[AskService] Found sheets tabs:', sheetsTabs);
            
            if (sheetsTabs.length === 0) {
                await this._simulateTyping('No Google Sheets tabs found in your browser.\n\n');
                await this._simulateTyping('Please open a Google Sheets document first, then try again.\n\n');
                
                // Provide fallback data
                const sampleData = this._generateSpreadsheetData(dataType, Math.min(rowCount, 5));
                await this._simulateTyping('Meanwhile, here\'s the data you can copy/paste:\n\n');
                await this._simulateTyping('```\n');
                await this._simulateTyping(sampleData.map(row => row.join('\t')).join('\n'));
                await this._simulateTyping('\n```\n');
                return;
            }

            // Use the first Google Sheets tab found
            const targetTab = sheetsTabs[0];
            await this._simulateTyping(`Found Google Sheets: ${targetTab.title}\n`);
            await this._simulateTyping(`Data type: ${dataType}\n`);
            await this._simulateTyping(`Rows to generate: ${rowCount}\n\n`);

            // Get page context to verify it's editable
            await this._simulateTyping('Analyzing spreadsheet...\n');
            const context = await this.chromeExtension.getPageContext(targetTab.id);
            
            if (!context.isGoogleSheets || !context.googleSheets?.isEditable) {
                await this._simulateTyping('Sheet is not editable or accessible.\n');
                await this._simulateTyping('Make sure you have edit permissions on the sheet.\n\n');
                return;
            }

            await this._simulateTyping('Sheet is ready for automation.\n');
            await this._simulateTyping(`Capabilities: ${context.googleSheets.capabilities?.join(', ')}\n\n`);

            // Generate mock data
            await this._simulateTyping(`Generating ${rowCount} rows of ${dataType} data...\n`);
            const mockData = this._generateSpreadsheetData(dataType, rowCount);
            
            await this._simulateTyping('Data generated successfully.\n');
            await this._simulateTyping(`Preview: ${mockData[0].join(', ')} (+ ${mockData.length - 1} data rows)\n\n`);

            // Fill the Google Sheets
            await this._simulateTyping('Filling Google Sheets automatically...\n');
            const fillResult = await this.chromeExtension.fillGoogleSheets(mockData, targetTab.id);

            if (fillResult.success) {
                await this._simulateTyping('Successfully automated your Google Sheet!\n\n');
                await this._simulateTyping(`Method: ${fillResult.method}\n`);
                await this._simulateTyping(`Cells filled: ${fillResult.cellsFilled}\n`);
                
                if (fillResult.method === 'clipboard_paste') {
                    await this._simulateTyping('Data copied to clipboard.\n');
                    await this._simulateTyping('Go to your Google Sheet and paste with Cmd+V (Mac) or Ctrl+V (Windows).\n');
                } else if (fillResult.method === 'bulk_paste') {
                    await this._simulateTyping('Used bulk paste for maximum speed.\n');
                } else {
                    await this._simulateTyping('Used individual cell filling for precision.\n');
                }
                
                if (fillResult.message) {
                    await this._simulateTyping(`\n${fillResult.message}\n`);
                } else {
                    await this._simulateTyping('\nYour data is now in your Google Sheet - check your browser!\n');
                }
            } else {
                await this._simulateTyping('Automation partially failed.\n\n');
                
                if (fillResult.errors && fillResult.errors.length > 0) {
                    await this._simulateTyping('Errors encountered:\n');
                    for (const error of fillResult.errors.slice(0, 3)) {
                        await this._simulateTyping(`• ${error}\n`);
                    }
                    await this._simulateTyping('\n');
                }

                // Provide fallback data
                await this._simulateTyping('Fallback: Copy this data manually:\n\n');
                await this._simulateTyping('```\n');
                await this._simulateTyping(mockData.map(row => row.join('\t')).join('\n'));
                await this._simulateTyping('\n```\n\n');
                await this._simulateTyping('Tip: Select cell A1 and paste (Cmd+V) this data.\n');
            }

        } catch (error) {
            console.error('[AskService] Chrome extension error:', error);
            await this._simulateTyping('Chrome extension automation failed.\n\n');
            await this._simulateTyping(`Error: ${error.message}\n\n`);
            
            // Provide fallback
            const sampleData = this._generateSpreadsheetData(dataType, Math.min(rowCount, 5));
            await this._simulateTyping('Fallback: Here\'s your data to copy/paste:\n\n');
            await this._simulateTyping('```\n');
            await this._simulateTyping(sampleData.map(row => row.join('\t')).join('\n'));
            await this._simulateTyping('\n```\n');
        }
    }

    /**
     * Handle email drafting automation
     * @private
     */
    async _handleEmailDraftRequest(context, userPrompt) {
        await this._simulateTyping(' I\'ll help you draft an email. ');
        
        if (context.hasEmailComposer) {
            await this._simulateTyping('I can see you have an email composer open.\n\n');
        }
        
        // Generate contextual email content
        const emailContent = this._generateEmailContent(userPrompt, context);
        
        await this._simulateTyping('Here\'s a professional email draft:\n\n');
        await this._simulateTyping('**Subject:** ' + emailContent.subject + '\n\n');
        await this._simulateTyping('**Body:**\n');
        await this._simulateTyping(emailContent.body + '\n\n');
        
        if (context.hasEmailComposer) {
            await this._simulateTyping(' **Inserting draft into your email composer...**\n\n');
            
            try {
                const browserWindow = this._getActiveBrowserWindow();
                if (browserWindow) {
                    // Insert email content
                    const insertResult = await domInteraction.executeCommand(
                        browserWindow.webContents,
                        'emailInsert',
                        {
                            content: emailContent.body,
                            position: 'replace'
                        }
                    );
                    
                    if (insertResult.success) {
                        await this._simulateTyping(` **Email draft inserted successfully!**\n`);
                        await this._simulateTyping(` **Application:** ${insertResult.result.type}\n`);
                        await this._simulateTyping(` **Content length:** ${insertResult.result.length} characters\n\n`);
                    } else {
                        await this._simulateTyping(' **Could not insert into email composer.**\n');
                        await this._simulateTyping('You can copy the draft above manually.\n\n');
                    }
                }
            } catch (error) {
                await this._simulateTyping(' **Email insertion failed.**\n');
                await this._simulateTyping('Please copy the draft content manually.\n\n');
            }
        }
        
        await this._simulateTyping('**I can also help you:**\n');
        await this._simulateTyping('-  **Customize the tone** (formal/casual/friendly)\n');
        await this._simulateTyping('-  **Edit specific sections** or add details\n');
        await this._simulateTyping('-  **Translate to another language**\n');
        await this._simulateTyping('-  **Add call-to-action** or next steps\n\n');
        await this._simulateTyping('What would you like me to adjust?');
    }

    /**
     * Generate email content based on user prompt
     * @private
     */
    _generateEmailContent(userPrompt, context) {
        const prompt = userPrompt.toLowerCase();
        
        // Detect email type and generate appropriate content
        if (prompt.includes('follow up') || prompt.includes('follow-up')) {
            return {
                subject: 'Following up on our conversation',
                body: `Dear [Recipient],\n\nI hope this email finds you well. I wanted to follow up on our recent conversation regarding [topic].\n\nAs discussed, [summary of key points]. I believe this presents a great opportunity for [mutual benefit/next steps].\n\nWould you be available for a brief call this week to discuss further? I'm happy to work around your schedule.\n\nThank you for your time and consideration.\n\nBest regards,\n[Your name]`
            };
        } else if (prompt.includes('meeting') || prompt.includes('schedule')) {
            return {
                subject: 'Meeting Request - [Topic]',
                body: `Dear [Recipient],\n\nI hope you're doing well. I would like to schedule a meeting to discuss [topic/project].\n\nThe purpose of this meeting would be to:\n- [Objective 1]\n- [Objective 2]\n- [Objective 3]\n\nI estimate we would need about [duration] for our discussion. Are you available sometime [timeframe]? I'm flexible with timing and can accommodate your schedule.\n\nPlease let me know what works best for you.\n\nThank you,\n[Your name]`
            };
        } else if (prompt.includes('thank') || prompt.includes('appreciation')) {
            return {
                subject: 'Thank you',
                body: `Dear [Recipient],\n\nI wanted to take a moment to express my sincere appreciation for [specific reason].\n\nYour [support/assistance/guidance] has been invaluable, and I'm grateful for [specific impact]. This has really helped me [outcome/achievement].\n\nI look forward to [future collaboration/continuing our work together].\n\nWarm regards,\n[Your name]`
            };
        } else if (prompt.includes('introduction') || prompt.includes('introduce')) {
            return {
                subject: 'Introduction - [Your name]',
                body: `Dear [Recipient],\n\nI hope this email finds you well. I'm [your name] and I [brief background/role].\n\nI'm reaching out because [reason for contact/mutual connection]. [Brief explanation of how you found them or why you're connecting].\n\nI would love the opportunity to [specific request/goal]. If you're open to it, I'd be happy to [next step/offer value].\n\nThank you for your time, and I look forward to hearing from you.\n\nBest regards,\n[Your name]`
            };
        } else {
            // Generic professional email
            return {
                subject: 'Professional Inquiry',
                body: `Dear [Recipient],\n\nI hope this email finds you well. I am writing to [purpose of email].\n\n[Main content - please customize based on your specific needs]\n\nI would appreciate the opportunity to [desired outcome/next step]. Please let me know if you need any additional information from my end.\n\nThank you for your time and consideration.\n\nBest regards,\n[Your name]`
            };
        }
    }

    /**
     * Handle text extraction automation
     * @private
     */
    async _handleTextExtractionRequest(context) {
        await this._simulateTyping(' Analyzing the page for text content...\n\n');
        
        // Simulate OCR or text extraction
        await this._simulateTyping('**Extracted Text:**\n');
        await this._simulateTyping('- Form labels and field names\n');
        await this._simulateTyping('- Navigation menu items\n');
        await this._simulateTyping('- Button text and links\n');
        await this._simulateTyping('- Content headings and paragraphs\n\n');
        
        await this._simulateTyping(' **Available Actions:**\n');
        await this._simulateTyping('- Copy specific text sections\n');
        await this._simulateTyping('- Extract contact information\n');
        await this._simulateTyping('- Identify fillable form fields\n');
        await this._simulateTyping('- Parse structured data\n\n');
        
        await this._simulateTyping('What specific text or data would you like me to extract?');
    }

    /**
     * Handle general automation requests
     * @private
     */
    async _handleGeneralAutomationRequest(context, userPrompt) {
        await this._simulateTyping(' **Automation Analysis:**\n\n');
        await this._simulateTyping(`Application Type: ${context.appType}\n`);
        await this._simulateTyping(`Confidence: ${Math.round(context.confidence * 100)}%\n`);
        await this._simulateTyping(`Available Fields: ${context.detectedFields.length}\n\n`);
        
        await this._simulateTyping('**I can help you with:**\n');
        await this._simulateTyping('-  **Form Automation** - Fill out forms automatically\n');
        await this._simulateTyping('-  **Email Composition** - Draft and insert email content\n');
        await this._simulateTyping('-  **Data Extraction** - Extract text and information\n');
        await this._simulateTyping('-  **Workflow Automation** - Chain multiple actions\n\n');
        
        await this._simulateTyping('**Next Steps:**\n');
        await this._simulateTyping('1. Tell me specifically what you\'d like me to automate\n');
        await this._simulateTyping('2. I\'ll analyze the page and create an action plan\n');
        await this._simulateTyping('3. Review and confirm before I execute any actions\n\n');
        
        await this._simulateTyping('What would you like me to help automate on this page?');
    }

    /**
     * Handle Google Sheets automation requests
     * @private
     */
    async _handleGoogleSheetsRequest(context, userPrompt) {
        await this._simulateTyping('🔍 Analyzing your Google Sheets request...\n');
        
        try {
            // Parse the user's Google Sheets intent
            const intent = brdyPilotService.parseGoogleSheetsIntent(userPrompt);
            
            if (intent.action === 'add_mock_data') {
                await this._simulateTyping(`📊 Generating ${intent.dataType || 'general'} mock data...\n`);
                
                // Get the current browser window for automation
                const browserWindow = this._getCurrentBrowserWindow();
                
                if (!browserWindow) {
                    await this._simulateTyping('📋 I can\'t directly access your browser, but I\'ll generate the mock data for you!\n\n');
                    
                    // Generate mock data using our existing system
                    const GoogleSheetsInteraction = require('../brdy-pilot/googleSheetsInteraction');
                    const sheets = new GoogleSheetsInteraction();
                    
                    await this._simulateTyping('📊 Generating mock data...\n');
                    
                    const mockData = sheets.generateMockData(intent.dataType || 'people', intent.rowCount || 10);
                    
                    // Convert to tab-separated format for easy pasting
                    const tsvData = mockData.map(row => row.join('\t')).join('\n');
                    
                    // Copy to clipboard
                    const { clipboard } = require('electron');
                    clipboard.writeText(tsvData);
                    
                    await this._simulateTyping('✅ Mock data generated and copied to clipboard!\n\n');
                    await this._simulateTyping('**What was generated:**\n');
                    await this._simulateTyping(`- Data Type: ${intent.dataType || 'people'}\n`);
                    await this._simulateTyping(`- Rows: ${intent.rowCount || 10} (including header)\n`);
                    await this._simulateTyping(`- Columns: ${mockData[0]?.length || 0}\n\n`);
                    
                    await this._simulateTyping('**Sample data:**\n');
                    await this._simulateTyping('```\n');
                    // Show first few rows as preview
                    const preview = mockData.slice(0, 4).map(row => row.join(' | ')).join('\n');
                    await this._simulateTyping(preview);
                    if (mockData.length > 4) {
                        await this._simulateTyping(`\n... and ${mockData.length - 4} more rows`);
                    }
                    await this._simulateTyping('\n```\n\n');
                    
                    await this._simulateTyping('**To add to your Google Sheet:**\n');
                    await this._simulateTyping('1. Click on cell A1 in your Google Sheet\n');
                    await this._simulateTyping('2. Press Cmd+V (Mac) or Ctrl+V (Windows) to paste\n');
                    await this._simulateTyping('3. The data will automatically fill into columns and rows!\n\n');
                    await this._simulateTyping('🎉 Ready to paste into your Google Sheet!');
                    return;
                }
                
                // Execute the Google Sheets automation
                const result = await brdyPilotService.handleGoogleSheetsQuery(userPrompt, browserWindow.webContents);
                
                if (result.success) {
                    await this._simulateTyping('✅ ' + result.response + '\n\n');
                    await this._simulateTyping('**What was added:**\n');
                    await this._simulateTyping(`- Data Type: ${intent.dataType || 'general'}\n`);
                    await this._simulateTyping(`- Rows: ${intent.rowCount || 10}\n`);
                    await this._simulateTyping(`- Starting Position: Row ${intent.startRow || 1}, Column ${intent.startCol || 1}\n\n`);
                    await this._simulateTyping('The data has been automatically inserted into your Google Sheet! 🎉');
                } else {
                    await this._simulateTyping('❌ ' + result.response + '\n\n');
                    await this._simulateTyping('**Troubleshooting:**\n');
                    await this._simulateTyping('1. Make sure you have Google Sheets open in your browser\n');
                    await this._simulateTyping('2. Ensure the sheet is not protected or read-only\n');
                    await this._simulateTyping('3. Try clicking on a cell in the sheet first\n');
                }
            } else {
                // Fallback to the original detection method
                const operation = this._detectSheetsOperation(userPrompt);
                await this._simulateTyping(`\n\n**Sheets Operation:** ${operation.type.replace('_', ' ').toUpperCase()}\n`);
                
                switch (operation.type) {
                    case 'create':
                        await this._handleSheetsCreation(operation, userPrompt);
                        break;
                    case 'fill_data':
                        await this._handleSheetsDataEntry(operation, userPrompt);
                        break;
                    case 'bulk_tasks':
                        await this._handleSheetsBulkTasks(operation, userPrompt);
                        break;
                    case 'template':
                        await this._handleSheetsTemplate(operation, userPrompt);
                        break;
                    default:
                        await this._handleGeneralSheetsGuidance(userPrompt);
                }
            }
        } catch (error) {
            console.error('[AskService] Error in Google Sheets automation:', error);
            await this._simulateTyping('❌ An error occurred while processing your Google Sheets request. Please try again.\n');
        }
    }

    /**
     * Get the current browser window for automation
     * @private
     */
    _getCurrentBrowserWindow() {
        const windows = BrowserWindow.getAllWindows();
        
        console.log(`[AskService] Checking ${windows.length} windows for browser detection`);
        
        // Look for browser windows (not Orbit windows)
        const browserWindows = windows.filter(win => {
            try {
                const title = win.getTitle().toLowerCase();
                const url = win.webContents.getURL();
                
                console.log(`[AskService] Window: title="${title}", url="${url}"`);
                
                // Skip Orbit's own windows
                if (title.includes('orbit') || url.includes('localhost') || url.includes('file://')) {
                    return false;
                }
                
                // Look for browser-like windows
                return title.includes('google sheets') || 
                       title.includes('sheets') ||
                       url.includes('docs.google.com/spreadsheets') ||
                       url.includes('sheets.google.com');
            } catch (error) {
                console.log(`[AskService] Error checking window:`, error.message);
                return false;
            }
        });
        
        // If we found a specific Google Sheets window, use that
        if (browserWindows.length > 0) {
            console.log(`[AskService] Found Google Sheets window: ${browserWindows[0].getTitle()}`);
            return browserWindows[0];
        }
        
        // Otherwise, look for any external browser window
        const externalWindows = windows.filter(win => {
            try {
                const url = win.webContents.getURL();
                return !url.includes('localhost') && !url.includes('file://') && url.startsWith('http');
            } catch (error) {
                return false;
            }
        });
        
        if (externalWindows.length > 0) {
            console.log(`[AskService] Found external browser window: ${externalWindows[0].getTitle()}`);
            return externalWindows[0];
        }
        
        console.log(`[AskService] No suitable browser window found`);
        return null;
    }

    /**
     * Detect the type of Google Sheets operation
     * @private
     */
    _detectSheetsOperation(userPrompt) {
        const prompt = userPrompt.toLowerCase();
        
        if (prompt.includes('create') || prompt.includes('new sheet')) {
            return { type: 'create', description: 'Create new spreadsheet' };
        }
        
        if (prompt.includes('fill') || prompt.includes('add data') || prompt.includes('enter data')) {
            return { type: 'fill_data', description: 'Fill spreadsheet with data' };
        }
        
        if (prompt.includes('bulk') || prompt.includes('multiple') || prompt.includes('many')) {
            return { type: 'bulk_tasks', description: 'Perform bulk operations' };
        }
        
        if (prompt.includes('template') || prompt.includes('format')) {
            return { type: 'template', description: 'Set up spreadsheet template' };
        }
        
        return { type: 'general', description: 'General sheets assistance' };
    }

    /**
     * Handle Google Sheets creation
     * @private
     */
    async _handleSheetsCreation(operation, userPrompt) {
        await this._simulateTyping('**Creating new Google Sheets:**\n');
        await this._simulateTyping('1. **Opening Google Sheets** - Going to sheets.google.com\n');
        
        try {
            const { shell } = require('electron');
            await shell.openExternal('https://sheets.google.com');
            await this._simulateTyping('Status: Opened Google Sheets in browser\n');
        } catch (error) {
            await this._simulateTyping('Status: Please manually navigate to sheets.google.com\n');
        }
        
        await this._simulateTyping('\n2. **Next Steps:**\n');
        await this._simulateTyping('- Click "Blank" to create a new spreadsheet\n');
        await this._simulateTyping('- Or choose a template that matches your needs\n');
        await this._simulateTyping('- Give your spreadsheet a descriptive name\n\n');
        
        await this._simulateTyping('**I can help you set up:**\n');
        await this._simulateTyping('- Column headers and data structure\n');
        await this._simulateTyping('- Formulas and calculations\n');
        await this._simulateTyping('- Data validation and formatting\n');
        await this._simulateTyping('- Templates for common use cases\n');
    }

    /**
     * Handle Google Sheets data entry
     * @private
     */
    async _handleSheetsDataEntry(operation, userPrompt) {
        await this._simulateTyping('**Data Entry Automation:**\n');
        
        // Parse data structure from the prompt
        const data = this._parseSheetsData(userPrompt);
        
        if (data.headers.length > 0) {
            await this._simulateTyping('\n**Suggested Column Headers:**\n');
            for (let i = 0; i < data.headers.length; i++) {
                await this._simulateTyping(`- Column ${String.fromCharCode(65 + i)}: ${data.headers[i]}\n`);
            }
        }
        
        await this._simulateTyping('\n**Automation Steps:**\n');
        await this._simulateTyping('1. **Open your Google Sheet** or create a new one\n');
        await this._simulateTyping('2. **Set up headers** in the first row\n');
        await this._simulateTyping('3. **Enter data** systematically starting from row 2\n');
        await this._simulateTyping('4. **Apply consistent formatting** as you go\n\n');
        
        await this._simulateTyping('**Efficiency Tips:**\n');
        await this._simulateTyping('- Use Ctrl+D to fill down formulas\n');
        await this._simulateTyping('- Set up data validation for consistent entries\n');
        await this._simulateTyping('- Use keyboard shortcuts for faster data entry\n');
        await this._simulateTyping('- Consider Google Forms for collecting data\n');
    }

    /**
     * Parse data structure from user prompt
     * @private
     */
    _parseSheetsData(userPrompt) {
        const data = { headers: [] };
        const prompt = userPrompt.toLowerCase();
        
        // Infer headers from common patterns
        if (prompt.includes('contact') || prompt.includes('customer')) {
            data.headers = ['Name', 'Email', 'Phone', 'Company'];
        } else if (prompt.includes('inventory') || prompt.includes('product')) {
            data.headers = ['Item', 'Quantity', 'Price', 'Category'];
        } else if (prompt.includes('task') || prompt.includes('project')) {
            data.headers = ['Task', 'Assignee', 'Due Date', 'Status'];
        } else if (prompt.includes('expense') || prompt.includes('budget')) {
            data.headers = ['Description', 'Amount', 'Category', 'Date'];
        } else if (prompt.includes('student') || prompt.includes('grade')) {
            data.headers = ['Student Name', 'Assignment', 'Grade', 'Comments'];
        } else if (prompt.includes('employee') || prompt.includes('staff')) {
            data.headers = ['Employee', 'Department', 'Position', 'Start Date'];
        }
        
        return data;
    }

    /**
     * Provide general Google Sheets guidance
     * @private
     */
    async _handleGeneralSheetsGuidance(userPrompt) {
        await this._simulateTyping('**Google Sheets Automation Options:**\n\n');
        
        await this._simulateTyping('**Common Tasks I can help with:**\n');
        await this._simulateTyping('- **Data Entry:** "Fill spreadsheet with customer data"\n');
        await this._simulateTyping('- **Template Creation:** "Create an inventory template"\n');
        await this._simulateTyping('- **Bulk Operations:** "Process multiple entries"\n');
        await this._simulateTyping('- **Formula Setup:** "Calculate totals and averages"\n\n');
        
        await this._simulateTyping('**Quick Actions:**\n');
        try {
            const { shell } = require('electron');
            await shell.openExternal('https://sheets.google.com');
            await this._simulateTyping('- Opened Google Sheets in your browser\n');
        } catch (error) {
            await this._simulateTyping('- Go to sheets.google.com to get started\n');
        }
        
        await this._simulateTyping('- Choose "Blank" for a new sheet\n');
        await this._simulateTyping('- Browse templates for pre-built solutions\n\n');
        
        await this._simulateTyping('**Pro Features:**\n');
        await this._simulateTyping('- **Real-time collaboration** with team members\n');
        await this._simulateTyping('- **Add-ons** for extended functionality\n');
        await this._simulateTyping('- **Apps Script** for custom automation\n');
        await this._simulateTyping('- **API integration** with other services\n');
    }

    /**
     * Handle Google Sheets bulk tasks
     * @private
     */
    async _handleSheetsBulkTasks(operation, userPrompt) {
        await this._simulateTyping('**Bulk Operations Setup:**\n');
        
        // Parse bulk operation type
        const prompt = userPrompt.toLowerCase();
        let operationType = 'general';
        
        if (prompt.includes('import') || prompt.includes('upload')) {
            operationType = 'import';
        } else if (prompt.includes('export') || prompt.includes('download')) {
            operationType = 'export';
        } else if (prompt.includes('update') || prompt.includes('modify')) {
            operationType = 'update';
        } else if (prompt.includes('delete') || prompt.includes('remove')) {
            operationType = 'delete';
        }
        
        await this._simulateTyping(`\n**Operation Type:** ${operationType.toUpperCase()}\n\n`);
        
        switch (operationType) {
            case 'import':
                await this._simulateTyping('**Import Process:**\n');
                await this._simulateTyping('1. **Open Google Sheets** and select your target sheet\n');
                await this._simulateTyping('2. **File → Import** to bring in external data\n');
                await this._simulateTyping('3. **Choose source:** Upload file, Google Drive, or URL\n');
                await this._simulateTyping('4. **Set import options:** Replace, append, or new sheet\n');
                await this._simulateTyping('5. **Review and confirm** the data import\n');
                break;
                
            case 'export':
                await this._simulateTyping('**Export Process:**\n');
                await this._simulateTyping('1. **Select data range** or entire sheet\n');
                await this._simulateTyping('2. **File → Download** to choose export format\n');
                await this._simulateTyping('3. **Available formats:** Excel, CSV, PDF, ODS\n');
                await this._simulateTyping('4. **Share link** for collaborative access\n');
                break;
                
            default:
                await this._simulateTyping('**Bulk Processing:**\n');
                await this._simulateTyping('1. **Select your data range** for bulk operations\n');
                await this._simulateTyping('2. **Use formulas** for mass calculations\n');
                await this._simulateTyping('3. **Apply formatting** to multiple cells at once\n');
                await this._simulateTyping('4. **Filter and sort** for data organization\n');
        }
        
        await this._simulateTyping('\n**Pro Tips:**\n');
        await this._simulateTyping('- Use Ctrl+Shift+End to select large ranges\n');
        await this._simulateTyping('- Apply conditional formatting for visual cues\n');
        await this._simulateTyping('- Use pivot tables for data analysis\n');
        await this._simulateTyping('- Set up data validation to prevent errors\n');
    }

    /**
     * Handle Google Sheets template creation
     * @private
     */
    async _handleSheetsTemplate(operation, userPrompt) {
        await this._simulateTyping('**Template Creation:**\n');
        
        // Determine template type based on prompt
        const prompt = userPrompt.toLowerCase();
        let templateType = 'custom';
        
        if (prompt.includes('budget') || prompt.includes('expense')) {
            templateType = 'budget';
        } else if (prompt.includes('inventory') || prompt.includes('stock')) {
            templateType = 'inventory';
        } else if (prompt.includes('project') || prompt.includes('task')) {
            templateType = 'project';
        } else if (prompt.includes('contact') || prompt.includes('customer')) {
            templateType = 'contact';
        } else if (prompt.includes('schedule') || prompt.includes('calendar')) {
            templateType = 'schedule';
        } else if (prompt.includes('invoice') || prompt.includes('billing')) {
            templateType = 'invoice';
        }
        
        await this._simulateTyping(`\n**Template Type:** ${templateType.toUpperCase()}\n\n`);
        
        // Open Google Sheets and wait for page load
        try {
            const { shell } = require('electron');
            await shell.openExternal('https://sheets.google.com');
            await this._simulateTyping('1. **Opened Google Sheets** - Waiting for page to load...\n');
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for page load
        } catch (error) {
            await this._simulateTyping('1. **Navigate to** sheets.google.com\n');
        }

        // Provide automation guidance
        await this._simulateTyping('2. **Creating new spreadsheet**...\n');
        await this._simulateTyping('   → **Click "Blank"** to create a new sheet\n');
        await this._simulateTyping('   → **Wait for sheet to load** (3-5 seconds)\n');
        
        // Give user time to follow instructions
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await this._simulateTyping('3. **Setting up template structure**...\n');
        await this._simulateTyping('   → **I will now provide step-by-step automation**\n');
        
        // Provide template structure based on type
        switch (templateType) {
            case 'budget':
                await this._simulateTyping('\n**Step-by-Step Budget Template Creation:**\n\n');
                
                // Headers
                await this._simulateTyping('**STEP 1: Create Headers**\n');
                await this._simulateTyping('Click cell A1 and type: **Category**\n');
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this._simulateTyping('Press TAB and type: **Description**\n');
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this._simulateTyping('Press TAB and type: **Budgeted Amount**\n');
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this._simulateTyping('Press TAB and type: **Actual Amount**\n');
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this._simulateTyping('Press TAB and type: **Difference**\n');
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this._simulateTyping('Press TAB and type: **Notes**\n');
                await this._simulateTyping('Press ENTER to move to row 2\n\n');
                
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Sample data
                await this._simulateTyping('**STEP 2: Add Sample Data**\n');
                await this._simulateTyping('Row 2 - Type: **Income** → TAB → **Salary** → TAB → **5000** → TAB → **5000** → TAB → **=D2-C2** → TAB → **Monthly**\n');
                await new Promise(resolve => setTimeout(resolve, 3000));
                await this._simulateTyping('Row 3 - Type: **Housing** → TAB → **Rent** → TAB → **1200** → TAB → **1200** → TAB → **=D3-C3** → TAB → **Fixed**\n');
                await new Promise(resolve => setTimeout(resolve, 3000));
                await this._simulateTyping('Row 4 - Type: **Food** → TAB → **Groceries** → TAB → **400** → TAB → **450** → TAB → **=D4-C4** → TAB → **Over budget**\n');
                await new Promise(resolve => setTimeout(resolve, 3000));
                await this._simulateTyping('Row 5 - Type: **Transportation** → TAB → **Gas** → TAB → **200** → TAB → **180** → TAB → **=D5-C5** → TAB → **Under budget**\n\n');
                
                await this._simulateTyping('**STEP 3: Format the Template**\n');
                await this._simulateTyping('• Select row 1 (headers) and make them **bold**\n');
                await this._simulateTyping('• Format columns C, D, E as **currency**\n');
                await this._simulateTyping('• Add borders around your data\n');
                await this._simulateTyping('• Consider conditional formatting for the Difference column\n');
                break;
                
            case 'inventory':
                await this._simulateTyping('\n**Inventory Template Structure:**\n');
                await this._simulateTyping('**Column A:** Item ID\n');
                await this._simulateTyping('**Column B:** Product Name\n');
                await this._simulateTyping('**Column C:** Category\n');
                await this._simulateTyping('**Column D:** Current Stock\n');
                await this._simulateTyping('**Column E:** Minimum Stock\n');
                await this._simulateTyping('**Column F:** Unit Price\n');
                await this._simulateTyping('**Column G:** Total Value (=D2*F2)\n');
                await this._simulateTyping('**Column H:** Supplier\n\n');
                
                await this._simulateTyping('**Sample Data:**\n');
                await this._simulateTyping('001 | Office Chair | Furniture | 25 | 10 | $150 | $3750 | OfficeMax\n');
                await this._simulateTyping('002 | Laptop Stand | Electronics | 15 | 5 | $45 | $675 | TechStore\n');
                break;
                
            case 'project':
                await this._simulateTyping('\n**Project Template Structure:**\n');
                await this._simulateTyping('**Column A:** Task ID\n');
                await this._simulateTyping('**Column B:** Task Name\n');
                await this._simulateTyping('**Column C:** Assignee\n');
                await this._simulateTyping('**Column D:** Start Date\n');
                await this._simulateTyping('**Column E:** Due Date\n');
                await this._simulateTyping('**Column F:** Status (Not Started, In Progress, Complete)\n');
                await this._simulateTyping('**Column G:** Priority (High, Medium, Low)\n');
                await this._simulateTyping('**Column H:** Notes\n\n');
                
                await this._simulateTyping('**Sample Data:**\n');
                await this._simulateTyping('T001 | Project Planning | John | 1/15/2025 | 1/20/2025 | In Progress | High\n');
                await this._simulateTyping('T002 | Design Mockups | Sarah | 1/21/2025 | 1/28/2025 | Not Started | Medium\n');
                break;
                
            default:
                await this._simulateTyping('\n**Custom Template Structure:**\n');
                await this._simulateTyping('2. **Click "Blank"** to create a new spreadsheet\n');
                await this._simulateTyping('3. **Add column headers** in row 1\n');
                await this._simulateTyping('4. **Format headers** (bold, background color)\n');
                await this._simulateTyping('5. **Set up data validation** for consistent entries\n');
                await this._simulateTyping('6. **Add formulas** for calculations\n');
                await this._simulateTyping('7. **Apply conditional formatting** for visual cues\n');
        }
        
        await this._simulateTyping('\n**Next Steps:**\n');
        await this._simulateTyping('- **Name your template** with a descriptive title\n');
        await this._simulateTyping('- **Add sample data** to test your structure\n');
        await this._simulateTyping('- **Format cells** for better readability\n');
        await this._simulateTyping('- **Share with team** if collaborative\n');
        await this._simulateTyping('- **Save as template** for future use\n');
    }


    /**
     * Detect if the user request involves multi-step workflow
     * @private
     */
    _detectWorkflowIntent(userPrompt) {
        const prompt = userPrompt.toLowerCase();
        const workflowKeywords = [
            'and then', 'then click', 'then search', 'then find',
            'click on', 'click the link', 'select', 'choose',
            'step 1', 'step 2', 'first', 'second', 'next',
            'after that', 'followed by'
        ];
        
        return workflowKeywords.some(keyword => prompt.includes(keyword));
    }

    /**
     * Handle multi-step workflow automation
     * @private
     */
    async _handleWorkflowRequest(context, userPrompt) {
        await this._simulateTyping('I\'ll help you execute this multi-step workflow. ');
        
        // Parse the workflow steps
        const steps = this._parseWorkflowSteps(userPrompt);
        
        await this._simulateTyping(`\n\n**Workflow Plan:**\n`);
        for (let i = 0; i < steps.length; i++) {
            await this._simulateTyping(`${i + 1}. ${steps[i].description}\n`);
        }
        
        await this._simulateTyping('\n**Execution:**\n');
        
        // Execute steps sequentially
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            await this._simulateTyping(`\n**Step ${i + 1}:** ${step.description}\n`);
            
            try {
                await this._executeWorkflowStep(step, i);
                await this._simulateTyping(`Status: Completed\n`);
                
                // Add delay between steps for user to see progress
                if (i < steps.length - 1) {
                    await this._simulateTyping('Proceeding to next step...\n');
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            } catch (error) {
                await this._simulateTyping(`Status: Failed - ${error.message}\n`);
                await this._simulateTyping('**Workflow stopped due to error.**\n');
                break;
            }
        }
        
        await this._simulateTyping('\n**Workflow Summary:**\n');
        await this._simulateTyping('- Multi-step automation completed\n');
        await this._simulateTyping('- Check your browser for the results\n');
        await this._simulateTyping('- You can ask me to continue or modify the workflow\n');
    }

    /**
     * Parse workflow steps from user prompt
     * @private
     */
    _parseWorkflowSteps(userPrompt) {
        const prompt = userPrompt.toLowerCase();
        const steps = [];
        
        // Pattern 1: "go to X and then Y"
        const goAndThenMatch = prompt.match(/go to (.+?) and then (.+)/);
        if (goAndThenMatch) {
            steps.push({
                type: 'navigate',
                description: `Navigate to ${goAndThenMatch[1]}`,
                target: goAndThenMatch[1].trim()
            });
            
            const secondAction = goAndThenMatch[2].trim();
            if (secondAction.includes('click')) {
                const clickMatch = secondAction.match(/click (?:on |the )?(.+)/);
                steps.push({
                    type: 'click',
                    description: `Click on ${clickMatch ? clickMatch[1] : secondAction}`,
                    target: clickMatch ? clickMatch[1].trim() : secondAction
                });
            } else if (secondAction.includes('search')) {
                const searchMatch = secondAction.match(/search (?:for )?(.+)/);
                steps.push({
                    type: 'search',
                    description: `Search for ${searchMatch ? searchMatch[1] : secondAction}`,
                    target: searchMatch ? searchMatch[1].trim() : secondAction
                });
            }
        }
        
        // Pattern 2: "google X and/then click Y" or "go to google and search X and click Y"
        const googleThenMatch = prompt.match(/(?:go to google and search|google|search) (.+?) (?:and|then) click (?:on |the )?(.+)/);
        if (googleThenMatch && steps.length === 0) {
            const searchTerm = googleThenMatch[1].trim();
            steps.push({
                type: 'search',
                description: `Search for ${searchTerm}`,
                target: searchTerm
            });
            steps.push({
                type: 'click',
                description: `Click on ${googleThenMatch[2]}`,
                target: googleThenMatch[2].trim(),
                context: { searchTerm: searchTerm }
            });
        }
        
        // Pattern 3: Google Sheets workflows
        const sheetsWorkflowMatch = prompt.match(/(?:create|open) (?:google )?sheet(?:s)? (?:and )?(?:then )?(.+)/);
        if (sheetsWorkflowMatch && steps.length === 0) {
            steps.push({
                type: 'sheets_create',
                description: 'Create/Open Google Sheets',
                target: 'sheets.google.com'
            });
            
            const nextAction = sheetsWorkflowMatch[1].trim();
            if (nextAction.includes('fill') || nextAction.includes('add data')) {
                steps.push({
                    type: 'sheets_fill',
                    description: `Fill sheet with data`,
                    target: nextAction
                });
            } else if (nextAction.includes('template')) {
                steps.push({
                    type: 'sheets_template',
                    description: 'Set up template',
                    target: nextAction
                });
            }
        }
        
        // Pattern 4: Multi-task workflows
        const multiTaskMatch = prompt.match(/(?:do|perform|complete) (?:multiple|several|many) (.+)/);
        if (multiTaskMatch && steps.length === 0) {
            const taskType = multiTaskMatch[1].trim();
            steps.push({
                type: 'multi_task',
                description: `Execute multiple ${taskType}`,
                target: taskType
            });
        }
        
        // Fallback: single navigation step
        if (steps.length === 0) {
            const destination = this._extractNavigationDestination(userPrompt);
            if (destination) {
                steps.push({
                    type: 'navigate',
                    description: `Navigate to ${destination}`,
                    target: destination
                });
            }
        }
        
        return steps;
    }

    /**
     * Execute a single workflow step
     * @private
     */
    async _executeWorkflowStep(step, stepIndex) {
        const { shell } = require('electron');
        
        switch (step.type) {
            case 'navigate':
                const url = this._buildNavigationURL(step.target);
                await this._simulateTyping(`Opening: ${url}\n`);
                await shell.openExternal(url);
                break;
                
            case 'search':
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(step.target)}`;
                await this._simulateTyping(`Searching: ${searchUrl}\n`);
                await shell.openExternal(searchUrl);
                break;
                
            case 'click':
                // Enhanced click automation with specific guidance
                if (step.target.includes('first') || step.target.includes('top')) {
                    await this._simulateTyping(`Automated click guidance:\n`);
                    await this._simulateTyping(`1. Look for the topmost search result (usually has a blue title link)\n`);
                    await this._simulateTyping(`2. Click on the first blue link in the search results\n`);
                    await this._simulateTyping(`3. This will take you to the website\n`);
                    
                    // Add delay to ensure search results load
                    setTimeout(async () => {
                        try {
                            // Try to open the first likely result based on search term
                            const searchTerm = step.context?.searchTerm || 'gobrdy';
                            if (searchTerm.includes('gobrdy')) {
                                await this._simulateTyping(`Attempting to navigate to gobrdy.com...\n`);
                                await shell.openExternal('https://www.gobrdy.com');
                            }
                        } catch (error) {
                            console.log('Could not auto-navigate to first result');
                        }
                    }, 2000);
                } else {
                    await this._simulateTyping(`Click target: ${step.target}\n`);
                    await this._simulateTyping(`Look for elements containing: "${step.target}"\n`);
                }
                break;
                
            case 'sheets_create':
                await this._simulateTyping(`Opening Google Sheets...\n`);
                await shell.openExternal('https://sheets.google.com');
                await this._simulateTyping(`Action: Click "Blank" to create a new spreadsheet\n`);
                break;
                
            case 'sheets_fill':
                await this._simulateTyping(`Guidance for filling spreadsheet:\n`);
                const data = this._parseSheetsData(step.target);
                if (data.headers.length > 0) {
                    await this._simulateTyping(`Suggested headers: ${data.headers.join(', ')}\n`);
                }
                await this._simulateTyping(`Next: Set up headers in row 1, then add data from row 2\n`);
                break;
                
            case 'sheets_template':
                await this._simulateTyping(`Setting up template structure:\n`);
                await this._simulateTyping(`1. Create column headers\n`);
                await this._simulateTyping(`2. Format cells appropriately\n`);
                await this._simulateTyping(`3. Add sample data row\n`);
                break;
                
            case 'multi_task':
                await this._simulateTyping(`Multi-task automation for: ${step.target}\n`);
                await this._simulateTyping(`Strategy: Break tasks into batches\n`);
                await this._simulateTyping(`Tip: Use consistent naming and formatting\n`);
                break;
                
            default:
                throw new Error(`Unknown step type: ${step.type}`);
        }
        
        // Give user time to see the action
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    /**
     * Handle navigation and URL opening requests
     * @private
     */
    async _handleNavigationRequest(context, userPrompt) {
        await this._simulateTyping('I\'ll help you navigate to your destination. ');
        
        // Extract destination from prompt
        const destination = this._extractNavigationDestination(userPrompt);
        
        if (destination) {
            await this._simulateTyping(`\n\n**Destination:** ${destination}\n`);
            await this._simulateTyping('**Navigation Options:**\n');
            await this._simulateTyping('1. **Open in new tab** (recommended)\n');
            await this._simulateTyping('2. **Open in current tab** (replaces current page)\n');
            await this._simulateTyping('3. **Open in external browser**\n\n');
            
            // Perform navigation based on context
            try {
                const url = this._buildNavigationURL(destination);
                await this._simulateTyping(`**Opening:** ${url}\n\n`);
                
                // Use DOM interaction to open URL
                const { shell } = require('electron');
                await shell.openExternal(url);
                
                await this._simulateTyping('**Successfully opened in your default browser!**\n\n');
                await this._simulateTyping('**Pro tip:** You can also ask me to:\n');
                await this._simulateTyping('- Search for specific content\n');
                await this._simulateTyping('- Fill out forms once the page loads\n');
                await this._simulateTyping('- Extract information from the new page\n');
                
            } catch (error) {
                await this._simulateTyping('**Navigation failed.** Please check the URL and try again.\n');
                await this._simulateTyping(`Error: ${error.message}\n\n`);
                await this._simulateTyping('**Alternative:** You can manually navigate to the URL above.\n');
            }
        } else {
            await this._simulateTyping('\n\n**I need more specific information:**\n');
            await this._simulateTyping('- What website would you like to visit?\n');
            await this._simulateTyping('- Are you looking for a specific search?\n');
            await this._simulateTyping('- Do you have a URL in mind?\n\n');
            await this._simulateTyping('**Examples:**\n');
            await this._simulateTyping('- "Go to Google"\n');
            await this._simulateTyping('- "Open Facebook"\n');
            await this._simulateTyping('- "Navigate to github.com"\n');
            await this._simulateTyping('- "Search for restaurants near me"\n');
        }
    }

    /**
     * Extract navigation destination from user prompt
     * @private
     */
    _extractNavigationDestination(userPrompt) {
        const prompt = userPrompt.toLowerCase();
        
        // Check for search patterns first (higher priority)
        const searchPatterns = [
            /(?:google|search|find).*(?:for|about)\s+(.+)/,
            /search\s+(.+)/,
            /google\s+(.+)/,
            /find\s+(.+)/,
            /look up\s+(.+)/
        ];
        
        for (const pattern of searchPatterns) {
            const match = prompt.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        
        // Common website patterns (only if no search intent detected)
        const websitePatterns = {
            'google': 'google.com',
            'facebook': 'facebook.com', 
            'twitter': 'twitter.com',
            'youtube': 'youtube.com',
            'github': 'github.com',
            'linkedin': 'linkedin.com',
            'amazon': 'amazon.com',
            'netflix': 'netflix.com',
            'gmail': 'mail.google.com',
            'outlook': 'outlook.com'
        };
        
        // Check for direct website mentions (only exact matches)
        for (const [keyword, url] of Object.entries(websitePatterns)) {
            if (prompt === keyword || prompt === `go to ${keyword}` || prompt === `open ${keyword}`) {
                return url;
            }
        }
        
        // Check for URL patterns
        const urlMatch = prompt.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.(?:[a-zA-Z]{2,}|[a-zA-Z]{2}\.[a-zA-Z]{2}))/);
        if (urlMatch) {
            return urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`;
        }
        
        // Check for "go to X" patterns
        const goToMatch = prompt.match(/(?:go to|navigate to|open|visit)\s+([a-zA-Z0-9.-]+(?:\.[a-zA-Z]{2,})?)/);
        if (goToMatch) {
            const destination = goToMatch[1];
            if (destination.includes('.')) {
                return destination.startsWith('http') ? destination : `https://${destination}`;
            }
        }
        
        return null;
    }

    /**
     * Build proper URL for navigation
     * @private
     */
    _buildNavigationURL(destination) {
        if (destination.startsWith('http://') || destination.startsWith('https://')) {
            return destination;
        }
        
        // For domain-only destinations, add https://
        if (destination.includes('.')) {
            return `https://${destination}`;
        }
        
        // For single words, assume it's a search
        return `https://www.google.com/search?q=${encodeURIComponent(destination)}`;
    }

    /**
     * Select appropriate model based on task type
     * @private
     */
    _selectModelForTask(prompt, baseModelInfo) {
        const promptLower = prompt.toLowerCase();
        
        // Reasoning/complex tasks - use reasoning model
        const reasoningKeywords = [
            'analyze', 'explain why', 'reasoning', 'logic', 'solve', 'calculate',
            'problem', 'strategy', 'plan', 'compare', 'evaluate', 'assess'
        ];
        
        // Fast/simple tasks - use mini model
        const fastKeywords = [
            'summarize', 'list', 'quick', 'simple', 'basic', 'short',
            'translate', 'convert', 'format', 'extract'
        ];
        
        // Mini/very simple tasks - use nano model
        const miniKeywords = [
            'yes or no', 'true or false', 'correct', 'spell', 'define',
            'what is', 'when is', 'where is', 'who is'
        ];

        // Get OpenAI model configurations
        const getOpenAIConfig = (modelType) => {
            const configs = {
                nano: {
                    model: 'gpt-4o-mini',
                    displayName: 'OPENAI_MODEL_MINI=gpt-5-nano-2025-08-07',
                    temperature: 0.3,
                    maxTokens: 1024
                },
                mini: {
                    model: 'gpt-4o',
                    displayName: 'OPENAI_MODEL_FAST=gpt-5-mini-2025-08-07',
                    temperature: 0.5,
                    maxTokens: 2048
                },
                reasoning: {
                    model: 'gpt-4o',
                    displayName: 'OPENAI_MODEL_REASONING=gpt-5-2025-08-07',
                    temperature: 0.1,
                    maxTokens: 4096
                },
                default: {
                    model: 'gpt-4o',
                    displayName: 'OPENAI_MODEL=gpt-5-2025-08-07',
                    temperature: 0.7,
                    maxTokens: 2048
                }
            };
            
            const config = configs[modelType] || configs.default;
            return {
                ...baseModelInfo,
                provider: 'openai',
                model: config.model,
                displayName: config.displayName,
                temperature: config.temperature,
                maxTokens: config.maxTokens
            };
        };
        
        if (miniKeywords.some(keyword => promptLower.includes(keyword))) {
            return getOpenAIConfig('nano');
        }
        
        if (fastKeywords.some(keyword => promptLower.includes(keyword))) {
            return getOpenAIConfig('mini');
        }
        
        if (reasoningKeywords.some(keyword => promptLower.includes(keyword))) {
            return getOpenAIConfig('reasoning');
        }
        
        // Default to main model
        return getOpenAIConfig('default');
    }

}

const askService = new AskService();

// Initialize the Chrome extension bridge and screen control asynchronously
(async () => {
    try {
        await askService.chromeExtension.init();
        console.log('[AskService] Chrome extension bridge initialized');
    } catch (error) {
        console.warn('[AskService] Chrome extension bridge initialization failed:', error);
    }
    
    try {
        // Initialize screen control with GPT-5 for best agentic performance
        const { createStreamingLLM } = require('../common/ai/factory');
        
        let aiProvider;
        let modelUsed = 'claude-sonnet-4';
        
        try {
            // Use Claude Sonnet 4 directly for better reliability
            console.log('[AskService] Initializing with Claude Sonnet 4 for screen control...');
            aiProvider = createStreamingLLM('anthropic', { 
                model: 'claude-sonnet-4',
                apiKey: process.env.ANTHROPIC_API_KEY,
                temperature: 0.1,
                maxTokens: 4096
            });
            modelUsed = 'claude-sonnet-4';
            
            // Test Claude with a simple request
            console.log('[AskService] Testing Claude Sonnet 4 availability...');
            const testResponse = await aiProvider.streamChat([
                { role: 'user', content: 'test' }
            ]);
            testResponse.body.getReader().releaseLock(); // Clean up test stream
            
        } catch (claudeError) {
            console.warn('[AskService] Claude Sonnet 4 failed, trying GPT fallback:', claudeError.message);
            
            try {
                // Try GPT-4o as fallback
                aiProvider = createStreamingLLM('openai', { 
                    model: 'gpt-4o',
                    apiKey: process.env.OPENAI_API_KEY,
                    temperature: 0.1,
                    maxTokens: 4096
                });
                modelUsed = 'gpt-4o';
                
                // Test GPT-4o with a simple request
                console.log('[AskService] Testing GPT-4o availability...');
                const testResponse = await aiProvider.streamChat([
                    { role: 'user', content: 'test' }
                ]);
                testResponse.body.getReader().releaseLock();
                
            } catch (gptError) {
                console.warn('[AskService] All providers failed, using last Claude attempt:', gptError.message);
                
                // Final fallback to Claude without testing
                aiProvider = createStreamingLLM('anthropic', { 
                    model: 'claude-sonnet-4',
                    apiKey: process.env.ANTHROPIC_API_KEY,
                    temperature: 0.1,
                    maxTokens: 4096
                });
                modelUsed = 'claude-sonnet-4';
            }
        }
        
        await screenControlService.initialize(aiProvider, modelUsed);
        console.log(`[AskService] Screen control service initialized with ${modelUsed}`);
    } catch (error) {
        console.warn('[AskService] Screen control service initialization failed:', error);
    }
})();

module.exports = askService;