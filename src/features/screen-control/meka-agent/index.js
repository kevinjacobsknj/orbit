/**
 * Meka Agent Integration for Orbit
 * Complete implementation of Meka's agent system adapted for Orbit
 */

const { z } = require('zod');
const MekaAgent = require('./agent');
const { createComputerTool } = require('./tools/computer');
const { createCompleteTaskTool } = require('./tools/complete-task');
const { createMemoryTool } = require('./tools/memory');
const { createWaitTool } = require('./tools/wait');
const OrbitComputerProvider = require('./providers/orbit-computer-provider');
const AnthropicAdapter = require('./providers/anthropic-adapter');

/**
 * Creates a complete Meka agent instance for Orbit
 */
function createOrbitMekaAgent(options) {
    const {
        aiProvider,
        logger = console
    } = options;
    
    // Create Orbit-specific computer provider
    const computerProvider = new OrbitComputerProvider();
    
    // Create agent with full Meka capabilities
    const agent = MekaAgent.createAgent({
        aiProvider,
        computerProvider,
        logger
    });
    
    return agent;
}

/**
 * Creates a simplified interface for Orbit to use Meka agent
 */
function createOrbitAgentInterface(aiProvider) {
    // Wrap the AI provider with Anthropic adapter for Meka compatibility
    const adaptedAiProvider = new AnthropicAdapter(aiProvider);
    const agent = createOrbitMekaAgent({ aiProvider: adaptedAiProvider });
    
    return {
        async executeTask(instructions, options = {}) {
            const session = await agent.initializeSession();
            
            // Extract URL from instructions if present
            let initialUrl = null;
            const urlMatch = instructions.match(/(?:navigate to |go to |visit |open )([^\s]+)/i);
            if (urlMatch) {
                let url = urlMatch[1];
                // Add protocol if missing
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                }
                initialUrl = url;
                console.log(`[OrbitAgentInterface] Extracted URL for initial navigation: ${initialUrl}`);
            }
            
            const task = await session.runTask({
                instructions,
                initialUrl,
                maxSteps: options.maxIterations || 35,
                outputSchema: z.object({
                    summary: z.string().describe("Summary of what was accomplished"),
                    success: z.boolean().describe("Whether the task was successful"),
                    details: z.any().optional().describe("Additional details or results")
                }),
                onStepComplete: options.onStepComplete,
                onTaskComplete: options.onTaskComplete
            });
            
            return {
                success: task.result?.success || false,
                summary: task.result?.summary || "Task execution completed",
                details: task.result?.details,
                iterations: task.logs.length,
                logs: task.logs
            };
        },
        
        async analyzeScreen(prompt) {
            const session = await agent.initializeSession();
            
            const task = await session.runTask({
                instructions: `Analyze the current screen and respond to: ${prompt}`,
                maxSteps: 1,
                outputSchema: z.object({
                    analysis: z.string().describe("Analysis of the screen")
                })
            });
            
            return {
                analysis: {
                    reasoning: task.result?.analysis || "Screen analysis completed"
                }
            };
        }
    };
}

module.exports = {
    createOrbitMekaAgent,
    createOrbitAgentInterface
};