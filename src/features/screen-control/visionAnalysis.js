/**
 * Vision Analysis for Computer Control
 * Integrates with AI models to analyze screen captures and determine actions
 */

const screenCapture = require('./screenCapture');
const mouseControl = require('./mouseControl');
const MemoryStore = require('./memoryStore');

// Ensure fetch is available for direct API calls
const fetch = globalThis.fetch || require('node-fetch');

class VisionAnalysis {
    constructor(aiProvider) {
        this.aiProvider = aiProvider;
        this.analysisHistory = [];
        this.isAnalyzing = false;
        
        // Initialize memory system with error handling
        try {
            this.memory = new MemoryStore();
            console.log('[VisionAnalysis] Memory system initialized successfully');
        } catch (error) {
            console.error('[VisionAnalysis] Failed to initialize memory system:', error);
            this.memory = null;
        }
    }

    /**
     * Analyze screen and execute user request
     */
    async analyzeAndAct(userRequest, options = {}) {
        try {
            this.isAnalyzing = true;
            const {
                maxIterations = 10,
                region = null,
                debug = false
            } = options;

            console.log('[VisionAnalysis] Starting analysis for:', userRequest);

            let iteration = 0;
            let lastAction = null;

            while (iteration < maxIterations) {
                iteration++;
                console.log(`[VisionAnalysis] Iteration ${iteration}/${maxIterations}`);

                // Capture current screen
                const capture = await screenCapture.captureScreen({ region });
                const base64Image = screenCapture.getBase64(capture);

                // Analyze with AI
                const analysis = await this.analyzeScreenWithAI(
                    userRequest, 
                    base64Image, 
                    lastAction,
                    iteration
                );

                if (debug) {
                    console.log('[VisionAnalysis] AI Analysis:', analysis);
                }

                // Execute the recommended action
                const actionResult = await this.executeAction(analysis);
                lastAction = actionResult;

                // Store analysis for history
                this.analysisHistory.push({
                    iteration,
                    timestamp: Date.now(),
                    userRequest,
                    analysis,
                    actionResult,
                    captureSize: capture.size
                });

                // Check if task is complete
                if (analysis.taskComplete || analysis.action === 'complete') {
                    console.log('[VisionAnalysis] ✅ Task completed successfully');
                    return {
                        success: true,
                        iterations: iteration,
                        finalAction: actionResult,
                        history: this.analysisHistory.slice(-iteration)
                    };
                }

                // Add delay between iterations
                await this.delay(1000);
            }

            console.log('[VisionAnalysis] ⚠️ Task incomplete after max iterations');
            return {
                success: false,
                reason: 'Max iterations reached',
                iterations: iteration,
                history: this.analysisHistory.slice(-iteration)
            };

        } catch (error) {
            console.error('[VisionAnalysis] Analysis failed:', error);
            throw error;
        } finally {
            this.isAnalyzing = false;
        }
    }

    /**
     * Analyze screen with AI model
     */
    async analyzeScreenWithAI(userRequest, base64Image, lastAction, iteration) {
        const prompt = this.buildAnalysisPrompt(userRequest, lastAction, iteration);

        try {
            // Use the configured AI provider (streaming interface)
            const messages = [
                {
                    role: 'system',
                    content: 'You are a computer control assistant. You MUST respond with ONLY valid JSON actions. Never refuse, never explain - only provide JSON actions to control the computer.'
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/png;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ];

            console.log('[VisionAnalysis] Making AI request with messages:', JSON.stringify(messages, null, 2).substring(0, 1000));
            
            const response = await this.aiProvider.streamChat(messages);
            console.log('[VisionAnalysis] Received response object:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                bodyType: typeof response.body,
                hasBody: !!response.body
            });
            
            if (!response.body) {
                throw new Error('No response body received from AI provider');
            }
            
            // Read the streaming response
            const reader = response.body.getReader();
            let fullContent = '';
            let chunkCount = 0;
            
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    chunkCount++;
                    
                    console.log(`[VisionAnalysis] Chunk ${chunkCount}: done=${done}, valueLength=${value ? value.length : 0}`);
                    
                    if (done) {
                        console.log('[VisionAnalysis] Stream ended, total chunks:', chunkCount);
                        break;
                    }
                    
                    const chunk = new TextDecoder().decode(value);
                    console.log(`[VisionAnalysis] Raw chunk ${chunkCount}:`, chunk.substring(0, 200));
                    
                    const lines = chunk.split('\n');
                    console.log(`[VisionAnalysis] Split into ${lines.length} lines`);
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6).trim();
                            console.log(`[VisionAnalysis] Processing data line:`, data.substring(0, 100));
                            
                            if (data === '[DONE]') {
                                console.log('[VisionAnalysis] Received [DONE] marker');
                                continue;
                            }
                            if (data === '') {
                                console.log('[VisionAnalysis] Skipping empty data line');
                                continue;
                            }
                            
                            try {
                                const parsed = JSON.parse(data);
                                console.log('[VisionAnalysis] Parsed JSON structure:', {
                                    hasChoices: !!parsed.choices,
                                    choicesLength: parsed.choices?.length,
                                    hasDelta: !!parsed.choices?.[0]?.delta,
                                    hasContent: !!parsed.choices?.[0]?.delta?.content,
                                    contentLength: parsed.choices?.[0]?.delta?.content?.length
                                });
                                
                                const content = parsed.choices?.[0]?.delta?.content || '';
                                if (content) {
                                    console.log('[VisionAnalysis] Adding content chunk:', content.substring(0, 50));
                                    fullContent += content;
                                } else {
                                    console.log('[VisionAnalysis] No content in this chunk');
                                }
                            } catch (e) {
                                console.log('[VisionAnalysis] JSON parse error:', e.message);
                                console.log('[VisionAnalysis] Failed to parse:', data.substring(0, 100));
                            }
                        } else if (line.trim()) {
                            console.log('[VisionAnalysis] Non-data line:', line.substring(0, 100));
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }

            console.log('[VisionAnalysis] Final content length:', fullContent.length);
            console.log('[VisionAnalysis] Full AI response:', fullContent.substring(0, 500));

            // If streaming returned empty content, try non-streaming approach
            if (fullContent.trim().length === 0) {
                console.warn('[VisionAnalysis] Streaming returned empty content, trying non-streaming approach...');
                return await this.analyzeWithNonStreaming(messages);
            }
            
            // Also try non-streaming if content seems incomplete or malformed
            if (fullContent.length < 10 || !fullContent.includes('{')) {
                console.warn('[VisionAnalysis] Streaming returned incomplete content, trying non-streaming approach...');
                console.warn('[VisionAnalysis] Content received:', fullContent);
                return await this.analyzeWithNonStreaming(messages);
            }

            // Parse the AI response
            return this.parseAIResponse(fullContent);

        } catch (error) {
            console.error('[VisionAnalysis] AI analysis failed:', error);
            
            // Fallback analysis
            return {
                action: 'wait',
                confidence: 0.1,
                reasoning: 'AI analysis failed, waiting for next iteration',
                taskComplete: false
            };
        }
    }

    /**
     * Build prompt for AI analysis
     */
    buildAnalysisPrompt(userRequest, lastAction, iteration) {
        const screenSize = { width: 1440, height: 900 }; // Default screen size
        
        let prompt = `You are an advanced AI Browsing Agent built by the team at Meka. Your role is to complete tasks for users by directly interacting with computer applications and interfaces.

## PRIMARY OBJECTIVE
Your top priority is to complete the user's instructions exactly as specified: "${userRequest}"
Focus on understanding what the user wants to accomplish and executing those steps precisely.

## USING UP TO DATE INFORMATION FROM BROWSING
As a browsing agent, you must complete the user's instructions by browsing the web and understanding the current information related to the user's task. Information found on the web is more important than information in your prior knowledge as your prior knowledge is outdated.

## TASK COMPLETION REQUIREMENT
- You MUST use the complete action to officially end the task
- The task cannot be completed without calling this action
- You CANNOT end the task by simply stopping - you must explicitly call complete

## FULL DESKTOP INTERACTION CAPABILITIES
IMPORTANT: You can interact with the ENTIRE computer screen, not just the browser content!
- The screenshot shows the complete desktop (${screenSize.width} width x ${screenSize.height} height pixels)
- You can click ANYWHERE on this screenshot: browser chrome, tabs, address bar, desktop, taskbar, etc.
- Coordinates (0,0) start at the top-left corner of the ENTIRE SCREENSHOT
- Do NOT limit yourself to just the webpage content
- Browser UI elements (address bar, tabs, bookmarks) are all clickable
- Operating system elements are also interactive

## COORDINATE PRECISION
- Analyze the ENTIRE screenshot carefully before clicking
- Look for ALL visual elements: buttons, links, input fields, browser UI, etc.
- Calculate coordinates based on the FULL screenshot dimensions
- If you see an element at position X,Y in the screenshot, click exactly at X,Y
- No coordinate adjustments needed - what you see is what you click

## CORE PRINCIPLES
1. **Complete User Instructions**: Your primary goal is to follow the user's instructions precisely. Understand their intent and execute each step exactly as requested.

2. **Take Action Immediately**: After taking a screenshot, DO NOT spend multiple turns analyzing. Take concrete actions immediately to progress toward the user's goal.

3. **Think Like the User**: Approach tasks from the user's perspective. Consider what they want to accomplish and the most efficient way to achieve it.

4. **Success-Driven Execution**: For each step, explicitly state your success criteria before and after execution. If specific success criteria are provided in the instructions, follow them precisely.

5. **Handle Obstacles Efficiently**: If you encounter obstacles that prevent completing the user's instructions, address them quickly or inform the user rather than continuing unsuccessfully.

6. **Context Awareness**: You have access to conversation history. Screenshots are labeled with step numbers so you can track progress and avoid repeating failed actions from earlier steps.

7. **Be exhaustive in your analysis and execution**: Think carefully about your approach, and remember that pages may require scrolling to see all elements. Something important that you are looking for may be hidden out of view and you should scroll to find it.

## CURRENT CONTEXT  
- Iteration: ${iteration}/35
- This is ${iteration === 1 ? 'your first action' : `step ${iteration} of the task`}

## AVAILABLE COMPUTER ACTIONS

You can interact with the application using these computer actions:
- **click**: Click at specific coordinates with optional button (left, right, middle)
- **double_click**: Double-click at specific coordinates  
- **scroll**: Scroll at specific coordinates with scroll_x and scroll_y values
- **keypress**: Press specific key combinations
- **type**: Type text at the current cursor position (text must not be empty)
- **drag**: Drag along a path of coordinates
- **move**: Move cursor to specific coordinates
- **wait**: Wait for a specified duration
- **memory**: Store, retrieve, or manage information
- **complete**: Officially complete the task

## RESPONSE FORMAT
You MUST respond with ONLY valid JSON in this exact format:
{
    "action": "click",
    "parameters": {"x": number, "y": number, "button": "left"},
    "reasoning": "Clear explanation of why this action",
    "confidence": 0.0-1.0,
    "taskComplete": false
}

## ACTION EXAMPLES:
{
    "action": "click",
    "parameters": {"x": 720, "y": 60, "button": "left"},
    "reasoning": "Clicking on address bar to navigate to news site",
    "confidence": 0.9,
    "taskComplete": false
}

{
    "action": "type",
    "parameters": {"text": "news.ycombinator.com"},
    "reasoning": "Typing the URL to navigate to Hacker News",
    "confidence": 0.9,
    "taskComplete": false
}

{
    "action": "scroll",
    "parameters": {"x": 720, "y": 400, "direction": "down", "amount": 3},
    "reasoning": "Scrolling down to see more articles",
    "confidence": 0.8,
    "taskComplete": false
}

{
    "action": "memory",
    "parameters": {"operation": "store", "key": "article1", "value": "First article title and summary"},
    "reasoning": "Storing first article information for final summary",
    "confidence": 0.9,
    "taskComplete": false
}

{
    "action": "complete",
    "parameters": {},
    "reasoning": "Successfully navigated to site and summarized top 3 articles",
    "confidence": 1.0,
    "taskComplete": true
}

## TASK EXECUTION WORKFLOW

1. **Initial Assessment**: Analyze the current state from the screenshot
2. **Clear Reasoning**: Provide clear analysis of what you observe and what needs to be done
3. **Immediate Action**: Take the next required action immediately based on your analysis
4. **Progress Verification**: Continue until all user requirements are met
5. **Official Completion**: Use complete action when all user requirements are met

## ACTION PRIORITY

- **ALWAYS prefer taking action over endless analysis when you can see what needs to be done**
- If you can see a button to click, text field to fill, or other UI element to interact with - ACT immediately
- Do NOT analyze the same page multiple times - if you've analyzed it once, take action

## IMPORTANT EXECUTION NOTES

- **BE DECISIVE**: When you see the elements needed for the user's task, immediately start interacting with them
- **NO ENDLESS ANALYSIS**: One analysis per page/state is enough
- **ACT ON WHAT YOU SEE**: If you see a form to fill or button to click for the user's goal, act immediately
- **FOLLOW THE TASK**: Focus on completing what the user specifically asked for
- **USE MEMORY FOR DATA ACCUMULATION**: For tasks requiring running totals or data across many pages, actively use the memory action to store and update information
- **THINK ABOUT ELEMENTS IN FOCUS**: When considering typing, consider whether the element you are typing into is in focus. If it is not, you may need to click on it to focus first
- **MUST USE COMPLETE**: You cannot end the task without using the complete action

Today's date is ${new Date().toISOString()}. The unix timestamp is ${Date.now()}.

Immediately start executing the user's instructions without excessive analysis.

REMEMBER: You MUST use the complete action to officially end the task. The task is NOT complete until you call complete.`;

        if (lastAction) {
            prompt += `
## PREVIOUS STEP RESULT:
Last action: ${lastAction.action}
${lastAction.result?.success ? '✅ Successfully executed' : '❌ Failed to execute'}
${lastAction.analysis?.reasoning ? `Reasoning was: ${lastAction.analysis.reasoning}` : ''}

Build on this progress to continue the task.
`;
        }

        prompt += `
## IMPORTANT REMINDERS:
- Respond with ONLY valid JSON - no explanations, no markdown
- Take ONE action per response
- Look at the ACTUAL screenshot - don't assume
- If you see the element needed, click/type immediately
- Set taskComplete:true ONLY when fully done

## TASK-SPECIFIC EXAMPLES:
For "navigate to news.ycombinator.com and summarize the top 3 articles":
Step 1: {"action": "click", "parameters": {"x": 400, "y": 50}, "reasoning": "Click address bar", "confidence": 0.9, "taskComplete": false}
Step 2: {"action": "type", "parameters": {"text": "news.ycombinator.com"}, "reasoning": "Type URL", "confidence": 0.9, "taskComplete": false}
Step 3: {"action": "key", "parameters": {"keys": ["Enter"]}, "reasoning": "Navigate to site", "confidence": 0.9, "taskComplete": false}
Step 4: {"action": "wait", "parameters": {"duration": 3000}, "reasoning": "Wait for page load", "confidence": 0.8, "taskComplete": false}
Step 5: {"action": "memory", "parameters": {"operation": "store", "key": "article1", "value": "Title and summary of first article"}, "reasoning": "Store first article", "confidence": 0.9, "taskComplete": false}
Step 6: {"action": "memory", "parameters": {"operation": "store", "key": "article2", "value": "Title and summary of second article"}, "reasoning": "Store second article", "confidence": 0.9, "taskComplete": false}
Step 7: {"action": "memory", "parameters": {"operation": "store", "key": "article3", "value": "Title and summary of third article"}, "reasoning": "Store third article", "confidence": 0.9, "taskComplete": false}
Step 8: {"action": "complete", "parameters": {}, "reasoning": "All 3 articles analyzed and stored", "confidence": 1.0, "taskComplete": true}

NOW ANALYZE THE SCREENSHOT AND RESPOND WITH YOUR NEXT JSON ACTION:`;

        return prompt;
    }

    /**
     * Fallback method using non-streaming API when streaming fails
     */
    async analyzeWithNonStreaming(messages) {
        try {
            console.log('[VisionAnalysis] Attempting non-streaming API call...');
            
            // Check if aiProvider has a non-streaming method
            if (this.aiProvider.generateContent) {
                // Anthropic/Gemini style
                const parts = [messages[0].content, messages[1].content[0].text];
                if (messages[1].content[1]) {
                    parts.push({
                        inlineData: {
                            mimeType: 'image/png',
                            data: messages[1].content[1].image_url.url.replace('data:image/png;base64,', '')
                        }
                    });
                }
                
                const result = await this.aiProvider.generateContent(parts);
                const content = result.response.text();
                console.log('[VisionAnalysis] Non-streaming response:', content.substring(0, 200));
                return this.parseAIResponse(content);
                
            } else {
                // Try to use a different approach - create a basic OpenAI API call
                console.log('[VisionAnalysis] Creating direct OpenAI API call...');
                
                const apiKey = process.env.OPENAI_API_KEY;
                if (!apiKey) {
                    throw new Error('No OpenAI API key available');
                }
                
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: messages,
                        max_tokens: 1000,
                        temperature: 0.1
                    })
                });
                
                console.log('[VisionAnalysis] Direct API response status:', response.status);
                
                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Failed to read error');
                    console.error('[VisionAnalysis] Direct API error details:', errorText);
                    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
                }
                
                const result = await response.json();
                const content = result.choices?.[0]?.message?.content || '';
                console.log('[VisionAnalysis] Direct API response length:', content.length);
                console.log('[VisionAnalysis] Direct API response:', content.substring(0, 300));
                
                if (!content || content.trim().length === 0) {
                    console.error('[VisionAnalysis] Direct API returned empty content');
                    throw new Error('Direct API returned empty content');
                }
                
                return this.parseAIResponse(content);
            }
            
        } catch (error) {
            console.error('[VisionAnalysis] Non-streaming also failed:', error);
            return this.createFallbackAction('Non-streaming API failed');
        }
    }

    /**
     * Parse AI response into action object
     */
    parseAIResponse(content) {
        try {
            console.log('[VisionAnalysis] Parsing AI response content:', content.substring(0, 200));
            
            // If AI refuses to help, force a basic action
            if (content.toLowerCase().includes("unable to interact") || 
                content.toLowerCase().includes("can't directly") ||
                content.toLowerCase().includes("cannot interact")) {
                console.log('[VisionAnalysis] AI refused to help, forcing basic action');
                return this.createFallbackAction(content);
            }
            
            // Remove markdown code blocks if present
            content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
            
            // Try multiple JSON extraction patterns
            let jsonMatch = content.match(/\{[\s\S]*?\}/);
            
            // If that didn't work or JSON seems incomplete, try to find the complete JSON object
            if (!jsonMatch || !jsonMatch[0].includes('taskComplete')) {
                // Look for a more complete JSON match that includes all required fields
                const completeMatch = content.match(/\{[\s\S]*?taskComplete[\s\S]*?\}/);
                if (completeMatch) {
                    jsonMatch = completeMatch;
                }
            }
            
            if (!jsonMatch) {
                // Try to find JSON after any text
                jsonMatch = content.match(/.*?(\{[\s\S]*\})/);
                if (jsonMatch) jsonMatch = [jsonMatch[1]];
            }
            
            if (!jsonMatch) {
                console.error('[VisionAnalysis] No JSON found in response:', content);
                return this.createFallbackAction(content);
            }

            console.log('[VisionAnalysis] Found JSON:', jsonMatch[0]);
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Validate required fields
            if (!parsed.action) {
                throw new Error('No action specified in AI response');
            }

            // Set defaults
            return {
                action: parsed.action,
                parameters: parsed.parameters || {},
                reasoning: parsed.reasoning || 'No reasoning provided',
                confidence: parsed.confidence || 0.5,
                taskComplete: parsed.taskComplete || false
            };

        } catch (error) {
            console.error('[VisionAnalysis] Failed to parse AI response:', error);
            console.error('[VisionAnalysis] Raw content was:', content);
            
            return this.createFallbackAction(content);
        }
    }

    /**
     * Create a fallback action when AI response can't be parsed
     */
    createFallbackAction(content) {
        // Try to extract intent from the failed response
        const lowerContent = content.toLowerCase();
        
        if (lowerContent.includes('click') || lowerContent.includes('browser')) {
            return {
                action: 'click',
                parameters: { x: 720, y: 450 }, // Screen center
                reasoning: 'Fallback click action based on content analysis',
                confidence: 0.3,
                taskComplete: false
            };
        }
        
        if (lowerContent.includes('type') || lowerContent.includes('search')) {
            return {
                action: 'type',
                parameters: { text: 'hi' },
                reasoning: 'Fallback type action based on content analysis',
                confidence: 0.3,
                taskComplete: false
            };
        }
        
        return {
            action: 'wait',
            parameters: {},
            reasoning: 'Waiting due to unparseable AI response',
            confidence: 0.1,
            taskComplete: false
        };
    }

    /**
     * Execute the action determined by AI
     */
    async executeAction(analysis) {
        const { action, parameters } = analysis;

        try {
            console.log(`[VisionAnalysis] Executing action: ${action}`, parameters);

            let result = { success: false };

            switch (action) {
                case 'click':
                    if (parameters.x && parameters.y) {
                        result = await mouseControl.click(parameters.x, parameters.y, {
                            ...parameters,
                            button: parameters.button || 'left'
                        });
                    }
                    break;

                case 'double_click':
                case 'doubleclick':
                    if (parameters.x && parameters.y) {
                        result = await mouseControl.click(parameters.x, parameters.y, {
                            ...parameters,
                            doubleClick: true
                        });
                    }
                    break;

                case 'type':
                    if (parameters.text) {
                        result = await mouseControl.type(parameters.text, parameters);
                    }
                    break;

                case 'key':
                case 'keypress':
                    if (parameters.keys) {
                        result = await mouseControl.keyPress(parameters.keys, parameters);
                    }
                    break;

                case 'scroll':
                    if (parameters.x !== undefined && parameters.y !== undefined) {
                        // Support both direction-based and delta-based scrolling
                        if (parameters.direction) {
                            result = await mouseControl.scroll(
                                parameters.x, 
                                parameters.y, 
                                parameters.direction, 
                                parameters.amount || 3
                            );
                        } else if (parameters.scroll_y !== undefined || parameters.scroll_x !== undefined) {
                            // Meka-style scrolling with deltas
                            const direction = parameters.scroll_y > 0 ? 'down' : 'up';
                            const amount = Math.abs(parameters.scroll_y || parameters.scroll_x || 3);
                            result = await mouseControl.scroll(
                                parameters.x,
                                parameters.y,
                                direction,
                                amount
                            );
                        }
                    }
                    break;

                case 'drag':
                    // Support both from/to and path-based dragging
                    if (parameters.path && Array.isArray(parameters.path)) {
                        // Meka-style path dragging
                        const path = parameters.path;
                        if (path.length >= 2) {
                            result = await mouseControl.drag(
                                path[0].x,
                                path[0].y,
                                path[path.length - 1].x,
                                path[path.length - 1].y,
                                parameters
                            );
                        }
                    } else if (parameters.fromX && parameters.fromY && parameters.toX && parameters.toY) {
                        result = await mouseControl.drag(
                            parameters.fromX, 
                            parameters.fromY, 
                            parameters.toX, 
                            parameters.toY, 
                            parameters
                        );
                    }
                    break;

                case 'move':
                    if (parameters.x && parameters.y) {
                        // Just move cursor without clicking
                        result = await mouseControl.getMousePosition();
                        console.log(`[VisionAnalysis] Moving cursor to (${parameters.x}, ${parameters.y})`);
                        result = { success: true, action: 'move', x: parameters.x, y: parameters.y };
                    }
                    break;

                case 'wait':
                    const duration = (parameters && parameters.duration) || 1000;
                    await this.delay(duration);
                    result = { success: true, action: 'wait', duration };
                    break;

                case 'complete':
                    // Store completion data in memory
                    try {
                        if (this.memory && this.memory.store) {
                            this.memory.store('task_completed', {
                                timestamp: Date.now(),
                                reason: analysis.reasoning,
                                finalState: analysis
                            });
                        }
                    } catch (error) {
                        console.warn('[VisionAnalysis] Memory store failed:', error.message);
                    }
                    result = { success: true, action: 'complete' };
                    break;

                case 'memory':
                    // Handle memory operations
                    result = await this.handleMemoryAction(parameters);
                    break;

                default:
                    console.warn('[VisionAnalysis] Unknown action:', action);
                    result = { success: false, error: 'Unknown action' };
            }

            console.log(`[VisionAnalysis] Action result:`, result);
            return { action, parameters, result, analysis };

        } catch (error) {
            console.error('[VisionAnalysis] Action execution failed:', error);
            
            // Provide specific guidance for common errors
            let enhancedError = error.message;
            if (error.message.includes('ACCESSIBILITY PERMISSION')) {
                enhancedError = `${error.message}\n\n🎯 The AI generated a perfect action but cannot execute it due to permissions.\n📖 See ACCESSIBILITY_SETUP.md for setup instructions.`;
            }
            
            return { 
                action, 
                parameters, 
                result: { success: false, error: enhancedError },
                analysis 
            };
        }
    }

    /**
     * Analyze specific element on screen
     */
    async analyzeElement(elementDescription, region = null) {
        try {
            const capture = await screenCapture.captureScreen({ region });
            const base64Image = screenCapture.getBase64(capture);

            const prompt = `Find "${elementDescription}" in this image. Return the coordinates where it can be clicked.

Respond in JSON format:
{
    "found": true/false,
    "x": 123, // center x coordinate
    "y": 456, // center y coordinate  
    "confidence": 0.8, // 0-1 confidence
    "description": "What you found"
}`;

            const messages = [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { 
                        type: 'image_url', 
                        image_url: {
                            url: `data:image/png;base64,${base64Image}`
                        }
                    }
                ]
            }];

            const response = await this.aiProvider.streamChat(messages);
            
            // Read the streaming response
            const reader = response.body.getReader();
            let fullContent = '';
            
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = new TextDecoder().decode(value);
                    const lines = chunk.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6).trim();
                            if (data === '[DONE]' || data === '') continue;
                            
                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content || '';
                                fullContent += content;
                            } catch (e) {
                                // Skip invalid JSON lines
                                console.log('[VisionAnalysis] Skipping invalid JSON:', data.substring(0, 100));
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }

            console.log('[VisionAnalysis] Full AI response:', fullContent.substring(0, 500));

            return this.parseAIResponse(fullContent);

        } catch (error) {
            console.error('[VisionAnalysis] Element analysis failed:', error);
            return { found: false, error: error.message };
        }
    }

    /**
     * Get current analysis status
     */
    getStatus() {
        return {
            isAnalyzing: this.isAnalyzing,
            historyCount: this.analysisHistory.length,
            lastAnalysis: this.analysisHistory[this.analysisHistory.length - 1] || null
        };
    }

    /**
     * Clear analysis history
     */
    clearHistory() {
        this.analysisHistory = [];
        console.log('[VisionAnalysis] Analysis history cleared');
    }

    /**
     * Handle memory operations
     */
    async handleMemoryAction(parameters) {
        const { operation, key, value, pattern } = parameters;
        
        // Safety check for memory initialization
        if (!this.memory) {
            console.warn('[VisionAnalysis] Memory system not initialized');
            return { success: false, error: 'Memory system not available' };
        }
        
        try {
            switch (operation) {
                case 'store':
                    return this.memory.store(key, value);
                case 'update':
                    return this.memory.update(key, value);
                case 'retrieve':
                    return this.memory.retrieve(key);
                case 'delete':
                    return this.memory.delete(key);
                case 'list':
                    return this.memory.list();
                case 'search':
                    return this.memory.search(pattern || key);
                case 'clear':
                    return this.memory.clear();
                default:
                    return { success: false, error: `Unknown memory operation: ${operation}` };
            }
        } catch (error) {
            console.error('[VisionAnalysis] Memory operation failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get memory statistics and current state
     */
    getMemoryStats() {
        return this.memory.getStats();
    }

    /**
     * Clear all analysis and memory data
     */
    reset() {
        this.analysisHistory = [];
        this.memory.clear();
        console.log('[VisionAnalysis] Reset completed - cleared history and memory');
    }

    /**
     * Utility: Add delay
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = VisionAnalysis;