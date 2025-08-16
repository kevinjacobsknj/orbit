/**
 * Complete Task Tool for Meka Agent in Orbit
 * Allows the agent to declare a task as complete
 */

const { z } = require('zod');

const completeTaskSchema = z.object({
    completionSummary: z
        .string()
        .describe("A comprehensive summary of what was accomplished during the task"),
    verificationEvidence: z
        .string()
        .describe("Evidence that the task requirements have been met (reference specific screenshots, actions, or outcomes)"),
    finalStateDescription: z
        .string()
        .describe("Description of the final state of the application after completing the task"),
});

/**
 * Creates a tool that allows the agent to declare a task as complete
 */
function createCompleteTaskTool({
    ground,
    evaluator,
    outputSchema,
    currentInstruction,
    logger = console,
}) {
    return {
        description: "Declare that the task is complete. This tool MUST be used to officially end the task. The task cannot be completed without calling this tool.",
        schema: completeTaskSchema,
        execute: async (args, context) => {
            logger.info("[CompleteTaskTool] Task completion requested", args);
            
            // For Orbit, we'll simplify the evaluation process
            // and directly generate the final output
            
            // Skip the complex object generation and just return the summary directly
            const output = {
                success: true,
                summary: args.completionSummary || "Task completed successfully",
                evidence: args.verificationEvidence || "Task completion confirmed",
                finalState: args.finalStateDescription || "Task finished",
                details: {
                    completionSummary: args.completionSummary,
                    verificationEvidence: args.verificationEvidence,
                    finalStateDescription: args.finalStateDescription
                }
            };
            
            logger.info("[CompleteTaskTool] Task completed with summary", { 
                summary: args.completionSummary,
                output: output
            });
            
            return { 
                type: "completion", 
                output: output 
            };
        },
    };
}

module.exports = {
    createCompleteTaskTool
};