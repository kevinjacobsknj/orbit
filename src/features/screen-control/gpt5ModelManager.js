/**
 * GPT-5 Model Manager for Screen Control
 * Intelligently selects and manages GPT-5 model variants
 */

class GPT5ModelManager {
    constructor() {
        this.models = {
            'gpt-5': {
                name: 'GPT-5',
                description: 'The best model for coding and agentic tasks',
                features: ['Text & vision', 'Superior reasoning', 'All built-in tools'],
                contextLength: '400k',
                maxOutput: '128k',
                pricing: { input: 1.25, output: 10.00 },
                bestFor: ['Complex automation', 'Multi-step workflows', 'Advanced reasoning'],
                temperature: 0.1,
                maxTokens: 8192
            },
            'gpt-5-mini': {
                name: 'GPT-5 Mini',
                description: 'A faster, cheaper version of GPT-5 for well-defined tasks',
                features: ['Text & vision', 'Good reasoning', 'All built-in tools'],
                contextLength: '400k',
                maxOutput: '128k',
                pricing: { input: 0.25, output: 2.00 },
                bestFor: ['Form filling', 'Simple automation', 'Well-defined tasks'],
                temperature: 0.2,
                maxTokens: 4096
            },
            'gpt-5-nano': {
                name: 'GPT-5 Nano',
                description: 'The fastest, cheapest version—great for classification',
                features: ['Text & vision', 'Fast reasoning', 'Basic tools'],
                contextLength: '400k',
                maxOutput: '128k',
                pricing: { input: 0.05, output: 0.40 },
                bestFor: ['Quick actions', 'Simple clicks', 'Classification'],
                temperature: 0.3,
                maxTokens: 2048
            }
        };
        
        this.currentModel = 'gpt-5';
        this.taskHistory = [];
    }

    /**
     * Analyze task complexity and select optimal model
     */
    selectModelForTask(userRequest) {
        const complexity = this.analyzeTaskComplexity(userRequest);
        const recommendation = this.getModelRecommendation(complexity);
        
        console.log(`[GPT5ModelManager] Task: "${userRequest}"`);
        console.log(`[GPT5ModelManager] Complexity: ${complexity.level} (score: ${complexity.score})`);
        console.log(`[GPT5ModelManager] Recommended model: ${recommendation.model}`);
        
        return recommendation;
    }

    /**
     * Analyze the complexity of a user request
     */
    analyzeTaskComplexity(userRequest) {
        const request = userRequest.toLowerCase();
        let complexity = 0;
        const factors = [];

        // High complexity indicators
        const highComplexityPatterns = [
            { pattern: /workflow|sequence|process|automation/, weight: 3, reason: 'Multi-step workflow' },
            { pattern: /navigate.*through|multiple.*steps/, weight: 3, reason: 'Navigation complexity' },
            { pattern: /complex|complicated|advanced/, weight: 2, reason: 'Explicit complexity' },
            { pattern: /if.*then|conditional|depending/, weight: 2, reason: 'Conditional logic' },
            { pattern: /data.*entry|spreadsheet.*fill/, weight: 2, reason: 'Data manipulation' }
        ];

        // Medium complexity indicators  
        const mediumComplexityPatterns = [
            { pattern: /fill.*form|submit.*form/, weight: 1, reason: 'Form interaction' },
            { pattern: /open.*and.*type|click.*and.*type/, weight: 1, reason: 'Multi-action task' },
            { pattern: /find.*and.*click|search.*and.*select/, weight: 1, reason: 'Search and action' }
        ];

        // Low complexity indicators
        const lowComplexityPatterns = [
            { pattern: /just|only|simple|quick/, weight: -1, reason: 'Explicit simplicity' },
            { pattern: /^(click|type|press|scroll)/, weight: -1, reason: 'Single action verb' },
            { pattern: /hi$|hello$|test$/, weight: -2, reason: 'Simple text input' }
        ];

        // Analyze patterns
        [...highComplexityPatterns, ...mediumComplexityPatterns, ...lowComplexityPatterns]
            .forEach(({ pattern, weight, reason }) => {
                if (pattern.test(request)) {
                    complexity += weight;
                    factors.push({ reason, weight });
                }
            });

        // Determine complexity level
        let level;
        if (complexity >= 3) level = 'high';
        else if (complexity >= 1) level = 'medium';
        else level = 'low';

        return { level, score: complexity, factors };
    }

    /**
     * Get model recommendation based on complexity
     */
    getModelRecommendation(complexity) {
        const { level, score } = complexity;
        
        let model, reasoning;
        
        switch (level) {
            case 'high':
                model = 'gpt-5';
                reasoning = 'Complex task requires maximum reasoning capabilities';
                break;
                
            case 'medium':
                model = 'gpt-5-mini';
                reasoning = 'Well-defined task suitable for optimized model';
                break;
                
            case 'low':
                model = 'gpt-5-nano';
                reasoning = 'Simple task can use fastest model';
                break;
                
            default:
                model = 'gpt-5-mini';
                reasoning = 'Default model for balanced performance';
        }

        return {
            model,
            reasoning,
            complexity: level,
            score,
            config: this.models[model]
        };
    }

    /**
     * Get model configuration
     */
    getModelConfig(modelName) {
        return this.models[modelName] || this.models['gpt-5'];
    }

    /**
     * Log task execution for learning
     */
    logTaskExecution(userRequest, model, success, duration, iterations) {
        const entry = {
            timestamp: Date.now(),
            userRequest,
            model,
            success,
            duration,
            iterations,
            complexity: this.analyzeTaskComplexity(userRequest)
        };
        
        this.taskHistory.push(entry);
        
        // Keep only last 100 entries
        if (this.taskHistory.length > 100) {
            this.taskHistory = this.taskHistory.slice(-100);
        }
        
        console.log(`[GPT5ModelManager] Task logged: ${success ? 'SUCCESS' : 'FAILED'} with ${model}`);
    }

    /**
     * Get performance statistics
     */
    getPerformanceStats() {
        if (this.taskHistory.length === 0) return null;

        const stats = {};
        
        Object.keys(this.models).forEach(model => {
            const modelTasks = this.taskHistory.filter(t => t.model === model);
            if (modelTasks.length > 0) {
                const successful = modelTasks.filter(t => t.success).length;
                const avgDuration = modelTasks.reduce((sum, t) => sum + t.duration, 0) / modelTasks.length;
                const avgIterations = modelTasks.reduce((sum, t) => sum + t.iterations, 0) / modelTasks.length;
                
                stats[model] = {
                    totalTasks: modelTasks.length,
                    successRate: (successful / modelTasks.length * 100).toFixed(1),
                    avgDuration: Math.round(avgDuration / 1000),
                    avgIterations: Math.round(avgIterations)
                };
            }
        });
        
        return stats;
    }

    /**
     * Get cost estimate for a task
     */
    estimateCost(userRequest, modelName = null) {
        const recommendation = modelName ? 
            { model: modelName } : 
            this.selectModelForTask(userRequest);
            
        const config = this.getModelConfig(recommendation.model);
        
        // Rough estimates based on task complexity
        const estimatedTokens = {
            input: 1000,  // Screenshot + prompt
            output: 200   // Action response
        };
        
        const cost = {
            input: (estimatedTokens.input / 1000000) * config.pricing.input,
            output: (estimatedTokens.output / 1000000) * config.pricing.output
        };
        
        return {
            model: recommendation.model,
            estimatedCost: cost.input + cost.output,
            breakdown: cost
        };
    }
}

module.exports = new GPT5ModelManager();