/**
 * Memory Tool for Meka Agent in Orbit
 * Provides persistent memory across task execution
 */

const { z } = require('zod');

/**
 * Session Memory Store implementation
 */
class SessionMemoryStore {
    constructor() {
        this.store = new Map();
        this.maxSize = 100;
    }

    set(key, value) {
        if (this.store.size >= this.maxSize) {
            // Remove oldest entry
            const firstKey = this.store.keys().next().value;
            this.store.delete(firstKey);
        }
        this.store.set(key, value);
        return { success: true };
    }

    get(key) {
        return this.store.get(key);
    }

    delete(key) {
        const existed = this.store.has(key);
        this.store.delete(key);
        return { success: existed };
    }

    list() {
        return Array.from(this.store.keys());
    }

    clear() {
        const size = this.store.size;
        this.store.clear();
        return { success: true, cleared: size };
    }

    getMemoryContext() {
        if (this.store.size === 0) {
            return null;
        }

        const entries = Array.from(this.store.entries());
        const context = entries.map(([key, value]) => `${key}: ${value}`).join('\n');
        return `[MEMORY CONTEXT]\n${context}\n[END MEMORY CONTEXT]`;
    }
}

const memoryToolSchema = z.object({
    action: z.enum(["store", "retrieve", "delete", "list", "clear"]).describe("Action to perform on memory"),
    key: z.string().optional().describe("Key for store/retrieve/delete operations"),
    value: z.string().optional().describe("Value for store operations"),
});

/**
 * Creates a memory tool for persistent data storage
 */
function createMemoryTool({ memoryStore }) {
    return {
        description: "Store, retrieve, or manage information in persistent memory across all steps. Use this for running calculations, accumulated data, intermediate results that need to persist across the conversation.",
        schema: memoryToolSchema,
        execute: async (args, context) => {
            const { action, key, value } = args;
            
            let result;
            let responseText;
            
            switch (action) {
                case "store":
                    if (!key || !value) {
                        throw new Error("Key and value are required for store operation");
                    }
                    result = memoryStore.set(key, value);
                    responseText = `Stored in memory: ${key} = ${value}`;
                    break;
                    
                case "retrieve":
                    if (!key) {
                        throw new Error("Key is required for retrieve operation");
                    }
                    const retrieved = memoryStore.get(key);
                    result = { success: retrieved !== undefined, value: retrieved };
                    responseText = retrieved !== undefined 
                        ? `Retrieved from memory: ${key} = ${retrieved}`
                        : `Key not found in memory: ${key}`;
                    break;
                    
                case "delete":
                    if (!key) {
                        throw new Error("Key is required for delete operation");
                    }
                    result = memoryStore.delete(key);
                    responseText = result.success 
                        ? `Deleted from memory: ${key}`
                        : `Key not found in memory: ${key}`;
                    break;
                    
                case "list":
                    const keys = memoryStore.list();
                    result = { success: true, keys };
                    responseText = keys.length > 0 
                        ? `Memory keys: ${keys.join(', ')}`
                        : "Memory is empty";
                    break;
                    
                case "clear":
                    result = memoryStore.clear();
                    responseText = `Cleared ${result.cleared} items from memory`;
                    break;
                    
                default:
                    throw new Error(`Unknown memory action: ${action}`);
            }
            
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
                                toolName: "memory",
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
    createMemoryTool,
    SessionMemoryStore,
};