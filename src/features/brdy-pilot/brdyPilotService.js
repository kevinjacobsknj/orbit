/**
 * Brdy Pilot Service - Main service for AI-powered automation
 * Integrates with Orbit's existing AI infrastructure
 */

const internalBridge = require('../../bridge/internalBridge');
const { createStreamingLLM } = require('../common/ai/factory');
const modelStateService = require('../common/services/modelStateService');

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
                throw new Error('AI model or API key not configured.');
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
            console.error('[Brdy Pilot] Failed to initialize AI provider:', error);
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
1. Application type (gmail, outlook, form_application, crm, ecommerce, etc.)
2. Key capabilities (email_compose, form_filling, data_entry, etc.)
3. Automation opportunities
4. Security considerations

Respond in JSON format:
{
    "appType": "string",
    "confidence": 0.0-1.0,
    "capabilities": ["capability1", "capability2"],
    "automationOpportunities": [
        {
            "type": "string",
            "description": "string",
            "elements": ["selector1", "selector2"]
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

    async executeAction(actionData) {
        // This will be implemented in the action layer
        console.log('[Brdy Pilot] Execute action:', actionData);
        return {
            success: true,
            data: { message: 'Action execution placeholder' }
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