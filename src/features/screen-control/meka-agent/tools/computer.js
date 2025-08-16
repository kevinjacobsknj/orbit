/**
 * Computer Tool for Meka Agent in Orbit
 * Allows the agent to perform computer actions
 */

const { z } = require('zod');

// Action schemas
const clickActionSchema = z.object({
    type: z.literal("click").describe("Type of action to perform"),
    x: z.number().describe("X coordinate for the click"),
    y: z.number().describe("Y coordinate for the click"),
    button: z.enum(["left", "right", "wheel"]).optional().describe("Mouse button to use for the click"),
});

const doubleClickActionSchema = z.object({
    type: z.literal("double_click").describe("Type of action to perform"),
    x: z.number().describe("X coordinate for the double click"),
    y: z.number().describe("Y coordinate for the double click"),
});

const dragActionSchema = z.object({
    type: z.literal("drag").describe("Type of action to perform"),
    path: z.array(z.object({ x: z.number(), y: z.number() })).describe("Array of coordinates for the drag path"),
});

const keypressActionSchema = z.object({
    type: z.literal("keypress").describe("Type of action to perform"),
    keys: z.array(z.string()).describe("Array of keys to press"),
});

const moveActionSchema = z.object({
    type: z.literal("move").describe("Type of action to perform"),
    x: z.number().describe("X coordinate to move the mouse to"),
    y: z.number().describe("Y coordinate to move the mouse to"),
});

const scrollActionSchema = z.object({
    type: z.literal("scroll").describe("Type of action to perform"),
    x: z.number().describe("X coordinate for the scroll"),
    y: z.number().describe("Y coordinate for the scroll"),
    scroll_x: z.number().describe("Horizontal scroll amount"),
    scroll_y: z.number().describe("Vertical scroll amount"),
});

const typeActionSchema = z.object({
    type: z.literal("type").describe("Type of action to perform"),
    text: z.string().min(1, "Text cannot be empty").describe("Text to type"),
});

const waitActionSchema = z.object({
    type: z.literal("wait").describe("Type of action to perform"),
    duration: z.number().min(0).describe("Duration to wait in seconds"),
});

const computerActionSchema = z.union([
    clickActionSchema,
    doubleClickActionSchema,
    scrollActionSchema,
    keypressActionSchema,
    typeActionSchema,
    dragActionSchema,
    moveActionSchema,
    waitActionSchema,
]);

const computerToolSchema = z.object({
    action: computerActionSchema,
    reasoning: z.string().describe("The reasoning for performing the action. Make sure you provide a clear and concise reasoning for the action so that users can understand what you are doing."),
});

/**
 * Creates a tool that allows the agent to perform computer actions
 */
function createComputerTool({ computerProvider }) {
    return {
        description: "Execute a computer action like clicking, dragging, typing, scrolling, etc. Use this for ALL interactions with the screen.",
        schema: computerToolSchema,
        getCurrentUrl: (context) => {
            return computerProvider.getCurrentUrl(context.sessionId);
        },
        execute: async (args, context) => {
            const result = await computerProvider.performAction(args.action, context);
            const screenshot = await computerProvider.takeScreenshot(context.sessionId);
            
            const response = {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `Computer action on ${result.timestamp}, result: ${result.actionPerformed}. Reasoning: ${result.reasoning} Screenshot as attached.`,
                    },
                    {
                        type: "image",
                        image: screenshot,
                    },
                ],
            };
            
            return {
                type: "response",
                response,
                updateCurrentAgentLog: (log) => ({
                    ...log,
                    screenshot: screenshot,
                    modelOutput: {
                        ...log.modelOutput,
                        toolCalls: [
                            {
                                toolName: "computer_action",
                                args: args,
                                result: result,
                            }
                        ]
                    }
                }),
            };
        },
    };
}

module.exports = {
    createComputerTool,
    computerActionSchema,
};