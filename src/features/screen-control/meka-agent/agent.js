/**
 * Meka Agent Core Implementation
 * Adapted from https://github.com/trymeka/agent
 */

const crypto = require('crypto');
const { z } = require('zod');
const { createCompleteTaskTool } = require('./tools/complete-task');
const { createComputerTool } = require('./tools/computer');
const { createMemoryTool, SessionMemoryStore } = require('./tools/memory');
const { createWaitTool } = require('./tools/wait');
const { SYSTEM_PROMPT } = require('./prompts/system');

const sessionIdGenerator = () => `session_${crypto.randomUUID()}`;

/**
 * Creates a Meka agent with full task execution capabilities
 */
function createAgent(options) {
    const {
        aiProvider,
        computerProvider,
        createSystemPrompt,
        logger = console
    } = options;

    const sessionMap = new Map();
    const sessionObjectCache = new Map();

    function createSession(sessionId) {
        // Session-level state for persistence
        let sessionMemoryStore = null;
        let sessionConversationChunk = null;
        let sessionConversationHistory = null;

        return {
            id: sessionId,
            
            /**
             * Ends the current session
             */
            end: async () => {
                const currentSession = sessionMap.get(sessionId);
                if (!currentSession) {
                    throw new Error(`Session not found for sessionId: ${sessionId}`);
                }
                sessionMap.set(sessionId, {
                    ...currentSession,
                    status: "stopped",
                    liveUrl: undefined,
                    computerProviderId: undefined,
                });
                await computerProvider.stop(sessionId);
            },

            /**
             * Retrieves a task by its ID
             */
            getTask: (taskId) => {
                const currentSession = sessionMap.get(sessionId);
                if (!currentSession) {
                    throw new Error(`Session not found for sessionId: ${sessionId}`);
                }
                return currentSession.tasks.find((task) => task.id === taskId);
            },

            /**
             * Retrieves the current session object
             */
            get: () => {
                const currentSession = sessionMap.get(sessionId);
                if (!currentSession) {
                    throw new Error(`Session not found for sessionId: ${sessionId}`);
                }
                return currentSession;
            },

            /**
             * Runs a task and returns the result
             */
            runTask: async (task) => {
                const MAX_STEPS = task.maxSteps || 100;
                const CONVERSATION_LOOK_BACK = 7;

                // Create or reuse persistent memory store for this task
                if (!sessionMemoryStore) {
                    sessionMemoryStore = new SessionMemoryStore();
                }
                const memoryStore = sessionMemoryStore;

                const coreTools = {
                    computer_action: createComputerTool({
                        computerProvider,
                    }),
                    complete_task: createCompleteTaskTool({
                        ground: aiProvider,
                        evaluator: undefined, // Simplified for Orbit
                        outputSchema: task.outputSchema || z.object({
                            value: z.string().describe("Result of the task")
                        }),
                        currentInstruction: task.instructions,
                        logger,
                    }),
                    memory: createMemoryTool({
                        memoryStore,
                    }),
                    wait: createWaitTool({
                        computerProvider,
                    }),
                };

                const allTools = {
                    ...coreTools,
                    ...task.customTools,
                };

                // Initialize conversation state
                let conversationHistory = [];
                let conversationChunk = new Map();
                
                function buildMessageInput(step, messages) {
                    conversationHistory.push(...messages);
                    const chunk = conversationChunk.get(step);
                    if (chunk) {
                        conversationChunk.set(step, [...chunk, ...messages]);
                    } else {
                        conversationChunk.set(step, messages);
                    }
                }

                function getMessageInput(step) {
                    const conversations = Array.from(conversationChunk.entries()).sort(
                        ([a], [b]) => a - b,
                    );
                    const relevantConversations = conversations.slice(
                        -CONVERSATION_LOOK_BACK,
                    );

                    if (step > CONVERSATION_LOOK_BACK) {
                        const task = conversationChunk.get(1);
                        const initialTaskMessage = task?.filter(
                            (msg) => msg.role === "user",
                        );
                        if (initialTaskMessage?.length) {
                            relevantConversations.unshift([1, initialTaskMessage]);
                        }
                    }

                    const messages = relevantConversations.flatMap(
                        ([_, messages]) => messages,
                    );

                    // Inject persistent memory context if available
                    const memoryContext = memoryStore.getMemoryContext();
                    if (memoryContext) {
                        messages.unshift({
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: memoryContext,
                                },
                            ],
                        });
                    }

                    return messages;
                }

                const currentSession = sessionMap.get(sessionId);
                if (!currentSession) {
                    throw new Error(`Session not found for sessionId: ${sessionId}`);
                }
                currentSession.status = "running";

                // Create new task
                let currentTask = {
                    id: crypto.randomUUID(),
                    instructions: task.instructions,
                    logs: [],
                    result: undefined,
                    initialUrl: task.initialUrl,
                };
                currentSession.tasks.push(currentTask);

                // Initialize fresh conversation state for new tasks
                sessionConversationHistory = [];
                sessionConversationChunk = new Map();
                conversationHistory = sessionConversationHistory;
                conversationChunk = sessionConversationChunk;

                logger.info("[Agent] Starting new task", {
                    taskId: currentTask.id,
                    instructions: task.instructions,
                });

                // Navigate to initial URL if provided
                if (task.initialUrl) {
                    logger.info("[Agent] Starting navigation to initial URL", {
                        initialUrl: task.initialUrl,
                    });
                    
                    const navigationResult = await computerProvider.navigateTo({
                        sessionId,
                        url: task.initialUrl,
                    });
                    
                    if (navigationResult.success) {
                        logger.info("[Agent] Successfully navigated to initial URL", {
                            initialUrl: task.initialUrl,
                            message: navigationResult.message
                        });
                    } else {
                        logger.warn("[Agent] Navigation may have failed", {
                            initialUrl: task.initialUrl,
                            error: navigationResult.error
                        });
                    }
                }

                logger.info("[Agent] Starting task execution", {
                    task: {
                        ...task,
                        outputSchema: task.outputSchema ? "custom" : "default",
                    },
                    tools: Object.keys(allTools),
                });

                let step = 1;
                const screenSize = await computerProvider.screenSize();

                // Take initial screenshot and build initial message
                const firstScreenshot = await computerProvider.takeScreenshot(sessionId);
                
                let initialMessage = `${task.instructions}`;
                
                // Add navigation context if URL was provided
                if (task.initialUrl) {
                    initialMessage += `\n\nNote: The browser has been automatically opened to ${task.initialUrl}. You should see this page in the screenshot below.`;
                }
                
                initialMessage += `\n\nHere is the current state of the screen:`;
                
                buildMessageInput(step, [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: initialMessage,
                            },
                            {
                                type: "image",
                                image: firstScreenshot,
                            },
                        ],
                    },
                ]);

                while (step < MAX_STEPS) {
                    const messages = getMessageInput(step);
                    
                    logger.info(`[Agent]: Step ${step}`, {
                        messagesCount: messages.length
                    });

                    // Generate model response
                    const requestPayload = {
                        systemPrompt: createSystemPrompt?.({ screenSize }) ?? SYSTEM_PROMPT({ screenSize }),
                        messages: messages,
                        tools: allTools,
                    };

                    logger.info("[Agent] Sending request to AI provider", {
                        messagesCount: messages.length,
                        toolsCount: Object.keys(allTools).length,
                        systemPromptLength: requestPayload.systemPrompt.length,
                    });

                    const response = await aiProvider.generateText(requestPayload);

                    logger.info("[Agent] Received response from LLM", {
                        response: response.text,
                        reasoning: response.reasoning,
                        toolCalls: response.toolCalls,
                    });

                    // Add assistant response to conversation history
                    if (response.text || response.reasoning) {
                        buildMessageInput(step, [
                            {
                                role: "assistant",
                                content: [
                                    {
                                        type: "text",
                                        text: response.text || response.reasoning || "",
                                    },
                                ],
                            },
                        ]);
                    }

                    if (response.toolCalls.length === 0) {
                        logger.info("[Agent] No tool calls in response, prompting for continuation");
                        buildMessageInput(step + 1, [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "Please continue with the task with what you think is best. If you believe the task is complete, use the complete_task tool.",
                                    },
                                ],
                            },
                        ]);
                    }

                    let agentLog = {
                        screenshot: firstScreenshot,
                        step,
                        timestamp: new Date().toISOString(),
                        currentUrl: await computerProvider.getCurrentUrl(sessionId),
                        modelOutput: {
                            done: [
                                {
                                    type: "text",
                                    text: response.text ?? "Processing...",
                                    reasoning: response.reasoning ?? "No reasoning provided",
                                },
                            ],
                        },
                        usage: {
                            model: "claude-sonnet-4",
                            inputTokensStep: response.usage?.inputTokens,
                            outputTokensStep: response.usage?.outputTokens,
                            totalTokensStep: response.usage?.totalTokens,
                        },
                    };

                    // Process tool calls
                    for (const toolCall of response.toolCalls) {
                        logger.info(`[Agent] Processing tool call: ${toolCall.toolName}`, {
                            toolCallId: toolCall.toolCallId,
                            toolName: toolCall.toolName,
                            toolArgs: toolCall.args,
                        });
                        
                        const tool = allTools[toolCall.toolName];
                        if (!tool) {
                            logger.error(`[Agent] Tool ${toolCall.toolName} not found`);
                            buildMessageInput(step, [
                                {
                                    role: "assistant",
                                    content: [
                                        {
                                            type: "text",
                                            text: `Tool ${toolCall.toolName} not found. Please select another tool.`,
                                        },
                                    ],
                                },
                            ]);
                            continue;
                        }
                        
                        const result = await tool.execute(toolCall.args, {
                            toolCallId: toolCall.toolCallId,
                            sessionId,
                            step,
                            messages: conversationHistory,
                        });

                        logger.info("[Agent] Tool call result", {
                            result: result.type === "completion" ? result.output : "response"
                        });

                        // If the tool is `complete_task`, return the result
                        if (result.type === "completion") {
                            currentTask.result = result.output;
                            currentSession.status = "idle";
                            currentTask.logs.push(agentLog);
                            
                            if (task.onTaskComplete) {
                                task.onTaskComplete({
                                    step,
                                    sessionId,
                                    result: result.output,
                                    currentTask: currentTask,
                                });
                            }

                            return currentTask;
                        }

                        // Update agent log for this step
                        if (result.updateCurrentAgentLog) {
                            agentLog = result.updateCurrentAgentLog(agentLog);
                        }
                        buildMessageInput(step + 1, [result.response]);
                    }

                    currentTask.logs.push(agentLog);
                    if (task.onStepComplete) {
                        task.onStepComplete({
                            step,
                            sessionId,
                            currentLog: agentLog,
                            currentTask: currentTask,
                        });
                    }
                    ++step;
                }

                throw new Error(`Agent has reached maximum steps of ${MAX_STEPS}.`);
            },
        };
    }

    const sessionManager = {
        /**
         * Retrieves an existing session
         */
        getSession: (sessionId) => {
            const currentSession = sessionMap.get(sessionId);
            if (!currentSession) {
                throw new Error(`Session not found for sessionId: ${sessionId}`);
            }

            let sessionObject = sessionObjectCache.get(sessionId);
            if (!sessionObject) {
                sessionObject = createSession(sessionId);
                sessionObjectCache.set(sessionId, sessionObject);
            }

            return sessionObject;
        },

        /**
         * Initializes a new agent session
         */
        initializeSession: async (args) => {
            const sessionId = args?.sessionIdOverride ?? sessionIdGenerator();
            sessionMap.set(sessionId, {
                id: sessionId,
                liveUrl: undefined,
                computerProviderId: "",
                tasks: [],
                status: "queued",
            });
            
            const { liveUrl, computerProviderId } = await computerProvider.start(sessionId, args?.computerProviderOptions);
            
            sessionMap.set(sessionId, {
                id: sessionId,
                liveUrl: liveUrl,
                computerProviderId,
                tasks: [],
                status: "idle",
            });
            
            const sessionObject = createSession(sessionId);
            sessionObjectCache.set(sessionId, sessionObject);
            return sessionObject;
        },
    };

    return sessionManager;
}

module.exports = {
    createAgent
};