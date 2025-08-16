/**
 * Screen Control Integration Module
 * Main entry point for computer control capabilities
 */

const screenCapture = require('./screenCapture');
const mouseControl = require('./mouseControl');
const VisionAnalysis = require('./visionAnalysis');
const gpt5ModelManager = require('./gpt5ModelManager');
const permissionManager = require('./permissionManager');
const { createOrbitAgentInterface } = require('./meka-agent');

class ScreenControlService {
    constructor() {
        this.visionAnalysis = null;
        this.mekaAgent = null;
        this.isEnabled = false;
        this.activeSession = null;
    }

    /**
     * Initialize with AI provider
     */
    async initialize(aiProvider, modelType = 'gpt-5') {
        this.visionAnalysis = new VisionAnalysis(aiProvider);
        this.mekaAgent = createOrbitAgentInterface(aiProvider);
        this.modelType = modelType;
        this.isEnabled = true;
        console.log(`[ScreenControl] Service initialized with ${modelType}`);
        
        // Configure based on model capabilities
        this.configureForModel(modelType);
        
        // Initialize permissions
        await permissionManager.initialize();
    }
    
    /**
     * Configure service based on GPT-5 model variant
     */
    configureForModel(modelType) {
        switch(modelType) {
            case 'claude-sonnet-4':
                // Claude Sonnet 4: Excellent vision and reasoning for complex tasks
                this.maxIterations = 35;
                this.confidence = 0.9;
                this.complexity = 'high';
                console.log('[ScreenControl] Configured for Claude Sonnet 4: Superior vision and multi-step reasoning');
                break;

            case 'gpt-5':
                // Full GPT-5: Best reasoning, complex multi-step tasks
                this.maxIterations = 20;
                this.confidence = 0.9;
                this.complexity = 'high';
                console.log('[ScreenControl] Configured for GPT-5: Maximum reasoning and agentic capabilities');
                break;
                
            case 'gpt-5-mini':
                // GPT-5 mini: Good for well-defined tasks, faster execution
                this.maxIterations = 15;
                this.confidence = 0.8;
                this.complexity = 'medium';
                console.log('[ScreenControl] Configured for GPT-5 mini: Optimized for well-defined tasks');
                break;
                
            case 'gpt-5-nano':
                // GPT-5 nano: Fast classification and simple actions
                this.maxIterations = 10;
                this.confidence = 0.7;
                this.complexity = 'low';
                console.log('[ScreenControl] Configured for GPT-5 nano: Fast execution for simple tasks');
                break;
                
            default:
                // Fallback configuration for other models
                this.maxIterations = 15;
                this.confidence = 0.8;
                this.complexity = 'medium';
        }
    }

    /**
     * Check if request requires computer control
     */
    detectControlIntent(userPrompt) {
        const prompt = userPrompt.toLowerCase();
        
        // Analysis-only keywords that should NOT trigger control
        const analysisKeywords = [
            'explain', 'describe', 'what\'s on', 'what is on', 'tell me about',
            'analyze', 'look at', 'see on', 'show me', 'visible on'
        ];
        
        // Check if this is a pure analysis request
        const isAnalysisRequest = analysisKeywords.some(keyword => prompt.includes(keyword));
        if (isAnalysisRequest && !prompt.includes('click') && !prompt.includes('type') && !prompt.includes('navigate')) {
            return { 
                shouldUseControl: false, 
                confidence: 0.1,
                reason: 'Analysis request - no action needed'
            };
        }
        
        const controlKeywords = [
            'click', 'press', 'type', 'fill', 'open', 'close', 'navigate',
            'scroll', 'drag', 'select', 'copy', 'paste', 'upload', 'download',
            'automation', 'automate', 'control', 'interact', 'computer'
        ];

        const actionPhrases = [
            'help me', 'can you', 'please', 'fill out', 'complete this',
            'do this for me', 'automate this', 'control the', 'on this page', 
            'in this app', 'on the computer'
        ];
        
        const hasControlKeyword = controlKeywords.some(keyword => prompt.includes(keyword));
        const hasActionPhrase = actionPhrases.some(phrase => prompt.includes(phrase));
        
        // High confidence if both are present
        if (hasControlKeyword && hasActionPhrase) {
            return { 
                shouldUseControl: true, 
                confidence: 0.9,
                reason: 'Contains both control keywords and action phrases'
            };
        }
        
        // Medium confidence for just control keywords
        if (hasControlKeyword) {
            return { 
                shouldUseControl: true, 
                confidence: 0.7,
                reason: 'Contains control keywords'
            };
        }
        
        // Check for direct computer control requests
        const directControlPhrases = [
            'take control', 'control my computer', 'automate this task',
            'do it for me', 'help me with this', 'complete this form'
        ];
        
        if (directControlPhrases.some(phrase => prompt.includes(phrase))) {
            return { 
                shouldUseControl: true, 
                confidence: 0.8,
                reason: 'Direct control request detected'
            };
        }

        return { 
            shouldUseControl: false, 
            confidence: 0.1,
            reason: 'No control intent detected'
        };
    }

    /**
     * Select optimal GPT-5 model based on task complexity
     */
    selectOptimalModel(userRequest) {
        const complexityKeywords = {
            high: ['complex', 'workflow', 'multiple steps', 'automation', 'process', 'sequence', 'navigate through'],
            medium: ['fill', 'form', 'click', 'open', 'close', 'type', 'submit'],
            low: ['simple', 'basic', 'quick', 'just', 'only']
        };
        
        const request = userRequest.toLowerCase();
        
        // Check for high complexity indicators
        if (complexityKeywords.high.some(keyword => request.includes(keyword))) {
            return 'gpt-5'; // Full reasoning power for complex tasks
        }
        
        // Check for low complexity indicators
        if (complexityKeywords.low.some(keyword => request.includes(keyword))) {
            return 'gpt-5-nano'; // Fast execution for simple tasks
        }
        
        // Default to mini for well-defined tasks
        return 'gpt-5-mini';
    }

    /**
     * Execute computer control task with Meka agent system
     */
    async executeControlTask(userRequest, options = {}) {
        if (!this.isEnabled || !this.mekaAgent) {
            throw new Error('Screen control not initialized');
        }

        // Check and request permissions if needed
        const hasPermissions = await permissionManager.ensurePermissions();
        if (!hasPermissions) {
            console.warn('[ScreenControl] Missing required permissions');
            // Continue anyway - some features may still work
        }

        try {
            console.log('[ScreenControl] Starting Meka agent task:', userRequest);
            
            // Use model-specific configuration
            const taskOptions = {
                ...options,
                maxIterations: options.maxIterations || this.maxIterations,
                debug: options.debug || false
            };
            
            this.activeSession = {
                id: `session_${Date.now()}`,
                userRequest,
                modelType: this.modelType,
                complexity: this.complexity,
                startTime: Date.now(),
                status: 'running'
            };

            // Execute task using Meka agent
            const result = await this.mekaAgent.executeTask(userRequest, taskOptions);
            
            this.activeSession.status = result.success ? 'completed' : 'failed';
            this.activeSession.endTime = Date.now();
            this.activeSession.duration = this.activeSession.endTime - this.activeSession.startTime;
            
            // Log performance for model learning
            gpt5ModelManager.logTaskExecution(
                userRequest,
                this.modelType,
                result.success,
                this.activeSession.duration,
                result.iterations || 0
            );
            
            return {
                success: result.success,
                summary: result.summary,
                details: result.details,
                iterations: result.iterations,
                history: result.logs,
                sessionId: this.activeSession.id,
                duration: this.activeSession.duration,
                modelUsed: this.modelType,
                complexity: this.complexity,
                costEstimate: gpt5ModelManager.estimateCost(userRequest, this.modelType)
            };

        } catch (error) {
            console.error('[ScreenControl] Meka agent task failed:', error);
            
            if (this.activeSession) {
                this.activeSession.status = 'error';
                this.activeSession.error = error.message;
            }
            
            throw error;
        }
    }

    /**
     * Take screenshot and analyze
     */
    async analyzeScreen(prompt = "Describe what you see on the screen") {
        if (!this.isEnabled || !this.visionAnalysis) {
            throw new Error('Screen control not initialized');
        }

        try {
            const capture = await screenCapture.captureScreen();
            const base64Image = screenCapture.getBase64(capture);

            // Simple analysis without action execution
            const analysis = await this.visionAnalysis.analyzeScreenWithAI(
                prompt, 
                base64Image, 
                null, 
                1
            );

            return {
                analysis,
                screenshot: {
                    timestamp: capture.timestamp,
                    size: capture.size
                }
            };

        } catch (error) {
            console.error('[ScreenControl] Screen analysis failed:', error);
            throw error;
        }
    }

    /**
     * Find and click element
     */
    async findAndClick(elementDescription) {
        if (!this.isEnabled || !this.visionAnalysis) {
            throw new Error('Screen control not initialized');
        }

        try {
            const elementData = await this.visionAnalysis.analyzeElement(elementDescription);
            
            if (elementData.found && elementData.x && elementData.y) {
                const clickResult = await mouseControl.click(elementData.x, elementData.y);
                return {
                    success: true,
                    element: elementData,
                    clickResult
                };
            } else {
                return {
                    success: false,
                    error: 'Element not found',
                    searchResult: elementData
                };
            }

        } catch (error) {
            console.error('[ScreenControl] Find and click failed:', error);
            throw error;
        }
    }

    /**
     * Type text at current cursor position
     */
    async typeText(text) {
        if (!this.isEnabled) {
            throw new Error('Screen control not initialized');
        }

        try {
            return await mouseControl.type(text);
        } catch (error) {
            console.error('[ScreenControl] Type text failed:', error);
            throw error;
        }
    }

    /**
     * Press keyboard keys
     */
    async pressKeys(keys) {
        if (!this.isEnabled) {
            throw new Error('Screen control not initialized');
        }

        try {
            return await mouseControl.keyPress(keys);
        } catch (error) {
            console.error('[ScreenControl] Press keys failed:', error);
            throw error;
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            isEnabled: this.isEnabled,
            hasVisionAnalysis: !!this.visionAnalysis,
            activeSession: this.activeSession,
            capabilities: this.isEnabled ? [
                'screen_capture',
                'vision_analysis', 
                'mouse_control',
                'keyboard_control',
                'automation_tasks'
            ] : []
        };
    }

    /**
     * Stop current session
     */
    stopCurrentSession() {
        if (this.activeSession && this.activeSession.status === 'running') {
            this.activeSession.status = 'stopped';
            this.activeSession.endTime = Date.now();
            console.log('[ScreenControl] Session stopped:', this.activeSession.id);
        }
    }

    /**
     * Enable/disable mouse control safety mode
     */
    setControlMode(enabled) {
        mouseControl.setControlMode(enabled);
        console.log(`[ScreenControl] Control mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }
}

module.exports = new ScreenControlService();