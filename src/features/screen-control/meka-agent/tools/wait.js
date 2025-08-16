/**
 * Wait Tool for Meka Agent in Orbit
 * Allows the agent to wait for a specified duration
 */

const { z } = require('zod');

const waitToolSchema = z.object({
    duration: z.number().min(0).describe("Duration to wait in seconds"),
});

/**
 * Creates a wait tool for timing delays
 */
function createWaitTool({ computerProvider }) {
    return {
        description: "Wait for a specified duration in seconds. Use this when navigating between pages, waiting for a page to load, an animation to complete, or a certain task/action to complete.",
        schema: waitToolSchema,
        execute: async (args, context) => {
            const { duration } = args;
            
            console.log(`[WaitTool] Waiting for ${duration} seconds...`);
            
            // Wait for the specified duration
            await new Promise(resolve => setTimeout(resolve, duration * 1000));
            
            const responseText = `Waited for ${duration} seconds`;
            
            const response = {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: responseText,
                    },
                ],
            };
            
            return {
                type: "response",
                response,
                updateCurrentAgentLog: (log) => ({
                    ...log,
                    modelOutput: {
                        ...log.modelOutput,
                        toolCalls: [
                            ...(log.modelOutput.toolCalls || []),
                            {
                                toolName: "wait",
                                args: args,
                                result: { success: true, duration },
                            }
                        ]
                    }
                }),
            };
        },
    };
}

module.exports = {
    createWaitTool,
};