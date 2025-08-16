/**
 * Brdy Pilot Service - Main service for AI-powered automation
 * Integrates with Orbit's existing AI infrastructure
 */

const internalBridge = require('../../bridge/internalBridge');
const { createStreamingLLM } = require('../common/ai/factory');
const modelStateService = require('../common/services/modelStateService');
const domInteraction = require('./domInteraction');

class BrdyPilotService {
    constructor() {
        this.aiProvider = null;
        this.currentContext = null;
        this.toolCallHistory = [];
        this.init();
    }

    async init() {
        // Initialize AI provider using Orbit's existing infrastructure
        try {
            const modelInfo = await modelStateService.getCurrentModelInfo('llm');
            if (!modelInfo || !modelInfo.apiKey) {
                console.warn('[Brdy Pilot] AI model not available during initialization, will retry when needed');
                this.aiProvider = null;
                return;
            }
            
            this.aiProvider = createStreamingLLM(modelInfo.provider, {
                apiKey: modelInfo.apiKey,
                model: modelInfo.model,
                temperature: 0.7,
                maxTokens: 2048,
                usePortkey: modelInfo.provider === 'openai-glass',
                portkeyVirtualKey: modelInfo.provider === 'openai-glass' ? modelInfo.apiKey : undefined,
            });
            console.log('[Brdy Pilot] Service initialized with AI provider');
        } catch (error) {
            console.warn('[Brdy Pilot] Failed to initialize AI provider, will work without it:', error.message);
            this.aiProvider = null;
        }

        // Listen for internal bridge events
        internalBridge.on('brdy-pilot:detectApp', this.handleDetectApp.bind(this));
        internalBridge.on('brdy-pilot:mapFields', this.handleMapFields.bind(this));
        internalBridge.on('brdy-pilot:askUser', this.handleAskUser.bind(this));
        internalBridge.on('brdy-pilot:draftText', this.handleDraftText.bind(this));
        internalBridge.on('brdy-pilot:executeAction', this.handleExecuteAction.bind(this));
    }

    /**
     * Tool Call: DetectApp
     * Analyzes the current web application and identifies its type and capabilities
     */
    async detectApp(context) {
        const toolCall = {
            name: 'DetectApp',
            timestamp: Date.now(),
            input: context
        };

        try {
            const prompt = this.buildDetectAppPrompt(context);
            const response = await this.callAI(prompt);
            
            const detection = this.parseDetectionResponse(response, context);
            
            toolCall.output = detection;
            toolCall.success = true;
            
            this.toolCallHistory.push(toolCall);
            
            return {
                success: true,
                data: detection
            };
            
        } catch (error) {
            toolCall.error = error.message;
            toolCall.success = false;
            this.toolCallHistory.push(toolCall);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    buildDetectAppPrompt(context) {
        return `
Analyze this web application and provide structured detection results.

URL: ${context.url}
Title: ${context.title}
Forms: ${context.pageData?.forms || 0}
Inputs: ${context.pageData?.inputs || 0}
Buttons: ${context.pageData?.buttons || 0}
Has ContentEditable: ${context.pageData?.hasContentEditable || false}

Page Structure:
${JSON.stringify(context.pageData, null, 2)}

Identify:
1. Application type (gmail, outlook, google_sheets, form_application, crm, ecommerce, etc.)
2. Key capabilities (email_compose, form_filling, data_entry, spreadsheet_editing, mock_data_generation, etc.)
3. Automation opportunities
4. Security considerations

For Google Sheets specifically, look for:
- Spreadsheet grid interface
- Cell editing capabilities  
- Formula bar presence
- Data entry opportunities

Respond in JSON format:
{
    "appType": "string",
    "confidence": 0.0-1.0,
    "capabilities": ["capability1", "capability2"],
    "automationOpportunities": [
        {
            "type": "string",
            "description": "string",
            "elements": ["selector1", "selector2"],
            "actionType": "google_sheets_mock_data|form_fill|email_compose"
        }
    ],
    "securityLevel": "low|medium|high",
    "recommendations": ["rec1", "rec2"]
}`;
    }

    parseDetectionResponse(response, context) {
        try {
            const parsed = JSON.parse(response);
            
            return {
                appType: parsed.appType || 'unknown',
                confidence: parsed.confidence || 0.5,
                capabilities: parsed.capabilities || [],
                automationOpportunities: parsed.automationOpportunities || [],
                securityLevel: parsed.securityLevel || 'medium',
                recommendations: parsed.recommendations || [],
                context: {
                    url: context.url,
                    title: context.title,
                    timestamp: Date.now()
                }
            };
        } catch (error) {
            // Fallback parsing
            return this.fallbackDetection(context);
        }
    }

    fallbackDetection(context) {
        const url = context.url.toLowerCase();
        const title = context.title.toLowerCase();
        
        let appType = 'web_application';
        let capabilities = [];
        
        if (url.includes('mail.google.com') || title.includes('gmail')) {
            appType = 'gmail';
            capabilities = ['email_compose', 'email_read', 'contact_management'];
        } else if (url.includes('docs.google.com/spreadsheets') || url.includes('sheets.google.com')) {
            appType = 'google_sheets';
            capabilities = ['spreadsheet_editing', 'data_entry', 'mock_data_generation', 'cell_manipulation', 'formula_insertion'];
        } else if (url.includes('outlook.') || title.includes('outlook')) {
            appType = 'outlook';
            capabilities = ['email_compose', 'email_read', 'calendar_management'];
        } else if (context.pageData?.forms > 0) {
            appType = 'form_application';
            capabilities = ['form_filling', 'data_entry'];
        }
        
        return {
            appType,
            confidence: 0.7,
            capabilities,
            automationOpportunities: [],
            securityLevel: 'medium',
            recommendations: [],
            context: {
                url: context.url,
                title: context.title,
                timestamp: Date.now()
            }
        };
    }

    /**
     * Tool Call: MapFields
     * Maps form fields to semantic meanings and suggests automation strategies
     */
    async mapFields(fieldsData) {
        const toolCall = {
            name: 'MapFields',
            timestamp: Date.now(),
            input: fieldsData
        };

        try {
            const prompt = this.buildMapFieldsPrompt(fieldsData);
            const response = await this.callAI(prompt);
            
            const mapping = this.parseFieldMappingResponse(response, fieldsData);
            
            toolCall.output = mapping;
            toolCall.success = true;
            
            this.toolCallHistory.push(toolCall);
            
            return {
                success: true,
                data: mapping
            };
            
        } catch (error) {
            toolCall.error = error.message;
            toolCall.success = false;
            this.toolCallHistory.push(toolCall);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    buildMapFieldsPrompt(fieldsData) {
        return `
Analyze these form fields and create semantic mappings for automation.

Fields to analyze:
${JSON.stringify(fieldsData.fields, null, 2)}

For each field, identify:
1. Semantic type (email, name, phone, address, etc.)
2. Required/optional status
3. Validation patterns
4. Automation priority (high/medium/low)
5. Suggested fill strategies

Respond in JSON format:
{
    "mappings": {
        "fieldSelector": {
            "semantic": "string",
            "type": "string",
            "required": boolean,
            "priority": "high|medium|low",
            "validation": "regex_pattern",
            "suggestions": ["suggestion1", "suggestion2"]
        }
    },
    "fillOrder": ["selector1", "selector2"],
    "confidence": 0.0-1.0,
    "automation": {
        "strategy": "sequential|parallel|conditional",
        "estimatedTime": number,
        "complexity": "low|medium|high"
    }
}`;
    }

    parseFieldMappingResponse(response, fieldsData) {
        try {
            const parsed = JSON.parse(response);
            
            return {
                mappings: parsed.mappings || {},
                fillOrder: parsed.fillOrder || [],
                confidence: parsed.confidence || 0.5,
                automation: parsed.automation || {
                    strategy: 'sequential',
                    estimatedTime: 5,
                    complexity: 'medium'
                },
                metadata: {
                    totalFields: fieldsData.fields?.length || 0,
                    mappedFields: Object.keys(parsed.mappings || {}).length,
                    timestamp: Date.now()
                }
            };
        } catch (error) {
            return this.fallbackFieldMapping(fieldsData);
        }
    }

    fallbackFieldMapping(fieldsData) {
        const mappings = {};
        const fillOrder = [];
        
        fieldsData.fields?.forEach(field => {
            const semantic = this.inferFieldSemantic(field);
            const selector = field.selector || `#${field.id}` || `[name="${field.name}"]`;
            
            if (semantic !== 'unknown') {
                mappings[selector] = {
                    semantic,
                    type: field.type || 'text',
                    required: field.required || false,
                    priority: semantic === 'email' ? 'high' : 'medium',
                    validation: this.getValidationPattern(semantic),
                    suggestions: this.getFieldSuggestions(semantic)
                };
                fillOrder.push(selector);
            }
        });
        
        return {
            mappings,
            fillOrder,
            confidence: 0.6,
            automation: {
                strategy: 'sequential',
                estimatedTime: fillOrder.length * 2,
                complexity: 'medium'
            },
            metadata: {
                totalFields: fieldsData.fields?.length || 0,
                mappedFields: Object.keys(mappings).length,
                timestamp: Date.now()
            }
        };
    }

    inferFieldSemantic(field) {
        const combined = `${field.name || ''} ${field.id || ''} ${field.placeholder || ''}`.toLowerCase();
        
        if (combined.includes('email') || field.type === 'email') return 'email';
        if (combined.includes('name') || combined.includes('first') || combined.includes('last')) return 'name';
        if (combined.includes('phone') || combined.includes('tel') || field.type === 'tel') return 'phone';
        if (combined.includes('address') || combined.includes('street') || combined.includes('city')) return 'address';
        if (combined.includes('company') || combined.includes('organization')) return 'company';
        if (combined.includes('subject') || combined.includes('title')) return 'subject';
        if (combined.includes('message') || combined.includes('comment') || combined.includes('body')) return 'message';
        
        return 'unknown';
    }

    getValidationPattern(semantic) {
        const patterns = {
            email: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
            phone: '^[\\+]?[1-9][\\d\\s\\-\\(\\)]{7,15}$',
            name: '^[a-zA-Z\\s]{2,50}$',
            address: '^.{5,100}$'
        };
        
        return patterns[semantic] || '';
    }

    getFieldSuggestions(semantic) {
        const suggestions = {
            email: ['Use primary email', 'Use work email', 'Generate test email'],
            name: ['Use full name', 'Use display name', 'Generate random name'],
            phone: ['Use primary phone', 'Use work phone', 'Generate test phone'],
            address: ['Use home address', 'Use work address', 'Generate test address'],
            company: ['Use current company', 'Generate test company'],
            subject: ['Generate relevant subject', 'Use template subject'],
            message: ['Generate contextual message', 'Use template message']
        };
        
        return suggestions[semantic] || [];
    }

    /**
     * Tool Call: AskUser
     * Interacts with the user through Orbit's interface for clarification or confirmation
     */
    async askUser(query) {
        const toolCall = {
            name: 'AskUser',
            timestamp: Date.now(),
            input: query
        };

        try {
            // Send query to Orbit's Ask system
            const response = await this.sendToOrbitAsk(query);
            
            toolCall.output = response;
            toolCall.success = true;
            
            this.toolCallHistory.push(toolCall);
            
            return {
                success: true,
                data: response
            };
            
        } catch (error) {
            toolCall.error = error.message;
            toolCall.success = false;
            this.toolCallHistory.push(toolCall);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    async sendToOrbitAsk(query) {
        return new Promise((resolve) => {
            // Emit to Orbit's Ask system
            internalBridge.emit('ask:sendQuestion', {
                question: query.question,
                context: {
                    source: 'brdy-pilot',
                    ...query.context
                }
            });
            
            // Listen for response
            const responseHandler = (response) => {
                internalBridge.off('ask:response', responseHandler);
                resolve({
                    answer: response.answer,
                    confidence: response.confidence || 0.8,
                    timestamp: Date.now()
                });
            };
            
            internalBridge.on('ask:response', responseHandler);
            
            // Timeout fallback
            setTimeout(() => {
                internalBridge.off('ask:response', responseHandler);
                resolve({
                    answer: 'No response received from user',
                    confidence: 0.0,
                    timeout: true,
                    timestamp: Date.now()
                });
            }, 30000); // 30 second timeout
        });
    }

    /**
     * Tool Call: DraftText
     * Generates contextual text using Orbit's AI capabilities
     */
    async draftText(context) {
        const toolCall = {
            name: 'DraftText',
            timestamp: Date.now(),
            input: context
        };

        try {
            const prompt = this.buildDraftTextPrompt(context);
            const response = await this.callAI(prompt);
            
            const draft = this.parseDraftResponse(response, context);
            
            toolCall.output = draft;
            toolCall.success = true;
            
            this.toolCallHistory.push(toolCall);
            
            return {
                success: true,
                data: draft
            };
            
        } catch (error) {
            toolCall.error = error.message;
            toolCall.success = false;
            this.toolCallHistory.push(toolCall);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    buildDraftTextPrompt(context) {
        const prompts = {
            email: `Draft a professional email with the following context:
Subject: ${context.subject || 'Professional communication'}
Tone: ${context.tone || 'professional'}
Purpose: ${context.purpose || 'general communication'}
Key points: ${context.keyPoints || 'None specified'}

Generate a well-structured email that is clear, concise, and appropriate for business communication.`,

            improve: `Improve the following text to make it more ${context.target || 'professional and clear'}:

Original text:
${context.text}

Provide an improved version that maintains the original meaning while enhancing clarity, tone, and structure.`,

            translate: `Translate the following text to ${context.targetLanguage || 'English'}:

Original text:
${context.text}

Provide an accurate translation that maintains the original tone and context.`,

            form: `Generate appropriate content for form field: ${context.fieldType}
Context: ${context.context || 'General form filling'}
Requirements: ${context.requirements || 'Standard professional content'}

Provide realistic, appropriate content for this field.`
        };

        return prompts[context.type] || prompts.form;
    }

    parseDraftResponse(response, context) {
        return {
            text: response,
            type: context.type,
            metadata: {
                length: response.length,
                wordCount: response.split(' ').length,
                timestamp: Date.now()
            },
            suggestions: this.generateTextSuggestions(context.type),
            confidence: 0.8
        };
    }

    generateTextSuggestions(type) {
        const suggestions = {
            email: ['Make more formal', 'Add call to action', 'Shorten content'],
            improve: ['Further simplify', 'Add more detail', 'Change tone'],
            translate: ['Verify accuracy', 'Adjust for cultural context', 'Check formality level'],
            form: ['Use different format', 'Add more specificity', 'Make more generic']
        };

        return suggestions[type] || [];
    }

    async callAI(prompt) {
        if (!this.aiProvider) {
            throw new Error('AI provider not initialized');
        }

        try {
            const response = await this.aiProvider.generateText({
                prompt: prompt,
                maxTokens: 1000,
                temperature: 0.7
            });

            return response.text || response;
        } catch (error) {
            console.error('[Brdy Pilot] AI call failed:', error);
            throw error;
        }
    }

    // Event handlers for internal bridge
    async handleDetectApp(data) {
        const result = await this.detectApp(data);
        internalBridge.emit('brdy-pilot:detectApp:result', result);
    }

    async handleMapFields(data) {
        const result = await this.mapFields(data);
        internalBridge.emit('brdy-pilot:mapFields:result', result);
    }

    async handleAskUser(data) {
        const result = await this.askUser(data);
        internalBridge.emit('brdy-pilot:askUser:result', result);
    }

    async handleDraftText(data) {
        const result = await this.draftText(data);
        internalBridge.emit('brdy-pilot:draftText:result', result);
    }

    async handleExecuteAction(data) {
        const result = await this.executeAction(data);
        internalBridge.emit('brdy-pilot:executeAction:result', result);
    }

    /**
     * Handle user query for Google Sheets automation
     * This method can be called when the user asks about adding mock data to Google Sheets
     */
    async handleGoogleSheetsQuery(query, webContents) {
        try {
            console.log('[Brdy Pilot] Handling Google Sheets query:', query);
            
            // Parse the query to extract intent and parameters
            const intent = this.parseGoogleSheetsIntent(query);
            
            if (intent.action === 'add_mock_data') {
                console.log('[Brdy Pilot] Detected add_mock_data intent:', intent);
                
                if (!webContents) {
                    return {
                        success: false,
                        response: "No browser window available for automation. Please make sure Google Sheets is open in your browser.",
                        error: "No webContents provided"
                    };
                }
                
                const result = await this.handleGoogleSheetsMockData({
                    webContents,
                    dataType: intent.dataType || 'people',
                    rowCount: intent.rowCount || 10,
                    startRow: intent.startRow || 1,
                    startCol: intent.startCol || 1
                });
                
                return {
                    success: result.success,
                    response: result.message || (result.success ? 'Mock data added successfully!' : 'Failed to add mock data'),
                    action: 'google_sheets_mock_data',
                    result: result
                };
            }
            
            return {
                success: false,
                response: "I can help you add mock data to Google Sheets. Please make sure you have a Google Sheets document open and ask me to 'add mock data to my Google Sheet'.",
                supportedActions: ['add_mock_data']
            };
            
        } catch (error) {
            console.error('[Brdy Pilot] Error handling Google Sheets query:', error);
            return {
                success: false,
                response: `Sorry, I encountered an error while trying to add mock data: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Parse user intent for Google Sheets operations
     */
    parseGoogleSheetsIntent(query) {
        const lowerQuery = query.toLowerCase();
        
        // Detect add mock data intent
        if (lowerQuery.includes('add mock data') || 
            lowerQuery.includes('add sample data') ||
            lowerQuery.includes('generate data') ||
            lowerQuery.includes('fill with data') ||
            lowerQuery.includes('generate') && (lowerQuery.includes('rows') || lowerQuery.includes('data')) ||
            lowerQuery.includes('fill') && (lowerQuery.includes('sheet') || lowerQuery.includes('spreadsheet')) ||
            lowerQuery.includes('create') && lowerQuery.includes('data') ||
            lowerQuery.includes('fill with') && (lowerQuery.includes('employee') || lowerQuery.includes('people') || lowerQuery.includes('sales') || lowerQuery.includes('financial') || lowerQuery.includes('inventory') || lowerQuery.includes('project')) ||
            lowerQuery.includes('add sample') && (lowerQuery.includes('transactions') || lowerQuery.includes('records') || lowerQuery.includes('entries'))) {
            
            const intent = { action: 'add_mock_data' };
            
            // Extract data type
            if (lowerQuery.includes('people') || lowerQuery.includes('employees') || lowerQuery.includes('contacts')) {
                intent.dataType = 'people';
            } else if (lowerQuery.includes('sales') || lowerQuery.includes('revenue')) {
                intent.dataType = 'sales';
            } else if (lowerQuery.includes('projects') || lowerQuery.includes('tasks')) {
                intent.dataType = 'projects';
            } else if (lowerQuery.includes('inventory') || lowerQuery.includes('products')) {
                intent.dataType = 'inventory';
            } else if (lowerQuery.includes('financial') || lowerQuery.includes('transactions')) {
                intent.dataType = 'financial';
            }
            
            // Extract row count
            const rowMatch = lowerQuery.match(/(\d+)\s*(rows?|records?|entries?)/);
            if (rowMatch) {
                intent.rowCount = parseInt(rowMatch[1]);
            }
            
            return intent;
        }
        
        return { action: 'unknown' };
    }

    async executeAction(actionData) {
        const toolCall = {
            name: 'ExecuteAction',
            timestamp: Date.now(),
            input: actionData
        };

        try {
            console.log('[Brdy Pilot] Execute action:', actionData);
            
            // Handle different action types
            let result;
            switch (actionData.type) {
                case 'google_sheets_mock_data':
                    result = await this.handleGoogleSheetsMockData(actionData);
                    break;
                    
                case 'form_fill':
                    result = await this.handleFormFill(actionData);
                    break;
                    
                case 'email_compose':
                    result = await this.handleEmailCompose(actionData);
                    break;
                    
                default:
                    result = { success: false, error: `Unknown action type: ${actionData.type}` };
            }
            
            toolCall.output = result;
            toolCall.success = result.success;
            this.toolCallHistory.push(toolCall);
            
            return result;
            
        } catch (error) {
            toolCall.error = error.message;
            toolCall.success = false;
            this.toolCallHistory.push(toolCall);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle Google Sheets mock data generation
     */
    async handleGoogleSheetsMockData(actionData) {
        try {
            const { webContents, dataType = 'people', rowCount = 10, startRow = 1, startCol = 1 } = actionData;
            
            if (!webContents) {
                return { success: false, error: 'WebContents not provided' };
            }
            
            console.log('[Brdy Pilot] Adding mock data to Google Sheets:', { dataType, rowCount, startRow, startCol });
            
            const result = await domInteraction.addMockDataToGoogleSheets(webContents, {
                dataType,
                rowCount,
                startRow,
                startCol
            });
            
            return {
                success: result.success,
                message: result.success 
                    ? `Successfully added ${rowCount} rows of ${dataType} data to Google Sheets`
                    : `Failed to add mock data: ${result.error}`,
                data: result.data,
                detection: result.detection
            };
            
        } catch (error) {
            console.error('[Brdy Pilot] Error handling Google Sheets mock data:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle form filling
     */
    async handleFormFill(actionData) {
        // Placeholder for form filling functionality
        return {
            success: false,
            error: 'Form filling not yet implemented'
        };
    }

    /**
     * Handle email composition
     */
    async handleEmailCompose(actionData) {
        // Placeholder for email composition functionality
        return {
            success: false,
            error: 'Email composition not yet implemented'
        };
    }

    getToolCallHistory() {
        return this.toolCallHistory;
    }

    clearHistory() {
        this.toolCallHistory = [];
    }

    getStatistics() {
        const total = this.toolCallHistory.length;
        const successful = this.toolCallHistory.filter(call => call.success).length;
        const byTool = this.toolCallHistory.reduce((acc, call) => {
            acc[call.name] = (acc[call.name] || 0) + 1;
            return acc;
        }, {});

        return {
            totalCalls: total,
            successfulCalls: successful,
            successRate: total > 0 ? successful / total : 0,
            callsByTool: byTool,
            lastCall: this.toolCallHistory[this.toolCallHistory.length - 1]?.timestamp
        };
    }
}

const brdyPilotService = new BrdyPilotService();

module.exports = brdyPilotService;