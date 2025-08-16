/**
 * Anthropic AI Provider Adapter for Meka Agent
 * Adapts Anthropic's API to work with Meka's AIProvider interface
 */

class AnthropicAdapter {
    constructor(anthropicProvider) {
        this.anthropicProvider = anthropicProvider;
    }

    async modelName() {
        return "claude-sonnet-4";
    }

    /**
     * Generate text with tool calling capabilities
     */
    async generateText({ systemPrompt, messages, tools }) {
        try {
            console.log('[AnthropicAdapter] Generating text with tools');
            
            // Convert tools to Anthropic format
            const anthropicTools = this.convertToolsToAnthropic(tools);
            
            // Prepare messages for Anthropic
            const anthropicMessages = this.convertMessagesToAnthropic(messages);
            
            // Make the request to Anthropic
            const response = await this.anthropicProvider.streamChat([
                {
                    role: 'system',
                    content: systemPrompt
                },
                ...anthropicMessages
            ], {
                tools: anthropicTools
            });

            // Parse the streaming response
            const content = await this.parseStreamingResponse(response);
            
            // Extract tool calls from the response
            const { text, toolCalls } = this.parseContentForToolCalls(content);
            
            return {
                text: text || "",
                reasoning: "", // Anthropic doesn't separate reasoning
                toolCalls: toolCalls,
                usage: {
                    inputTokens: 0, // Would need to be tracked
                    outputTokens: 0,
                    totalTokens: 0
                }
            };
            
        } catch (error) {
            console.error('[AnthropicAdapter] Error generating text:', error);
            throw error;
        }
    }

    /**
     * Generate structured object (for task completion)
     */
    async generateObject({ messages, schema }) {
        try {
            console.log('[AnthropicAdapter] Generating structured object');
            
            // For Anthropic, we'll request JSON format and parse it
            const anthropicMessages = this.convertMessagesToAnthropic(messages);
            anthropicMessages.push({
                role: 'user',
                content: [{
                    type: 'text',
                    text: `Please respond with a valid JSON object that matches this schema: ${JSON.stringify(schema._def)}`
                }]
            });
            
            const response = await this.anthropicProvider.streamChat(anthropicMessages);
            const content = await this.parseStreamingResponse(response);
            
            // Try to parse as JSON
            let parsedObject;
            try {
                // Extract JSON from the response
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsedObject = JSON.parse(jsonMatch[0]);
                } else {
                    // Fallback: create a simple object
                    parsedObject = {
                        summary: content.trim(),
                        success: true
                    };
                }
            } catch (parseError) {
                console.warn('[AnthropicAdapter] Failed to parse JSON, using fallback');
                parsedObject = {
                    summary: content.trim(),
                    success: true
                };
            }
            
            return {
                object: parsedObject,
                usage: {
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0
                }
            };
            
        } catch (error) {
            console.error('[AnthropicAdapter] Error generating object:', error);
            throw error;
        }
    }

    /**
     * Convert Meka tools to Anthropic format
     */
    convertToolsToAnthropic(tools) {
        const anthropicTools = [];
        
        for (const [toolName, tool] of Object.entries(tools)) {
            anthropicTools.push({
                name: toolName,
                description: tool.description,
                input_schema: {
                    type: "object",
                    properties: this.zodSchemaToProperties(tool.schema),
                    required: this.getRequiredProperties(tool.schema)
                }
            });
        }
        
        return anthropicTools;
    }

    /**
     * Convert Meka messages to Anthropic format
     */
    convertMessagesToAnthropic(messages) {
        return messages.map(msg => {
            if (msg.role === 'assistant' && msg.toolCalls) {
                // Handle tool calls in assistant messages
                return {
                    role: 'assistant',
                    content: msg.content || [],
                    tool_calls: msg.toolCalls.map(tc => ({
                        id: tc.toolCallId,
                        type: 'function',
                        function: {
                            name: tc.toolName,
                            arguments: JSON.stringify(tc.args)
                        }
                    }))
                };
            }
            
            return {
                role: msg.role,
                content: msg.content
            };
        });
    }

    /**
     * Parse streaming response from Anthropic
     */
    async parseStreamingResponse(response) {
        if (!response.body) {
            throw new Error('No response body received');
        }
        
        const reader = response.body.getReader();
        let fullContent = '';
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = new TextDecoder().decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();
                        if (data === '[DONE]' || data === '') continue;
                        
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content || '';
                            if (content) {
                                fullContent += content;
                            }
                        } catch (e) {
                            // Skip invalid JSON lines
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
        
        return fullContent;
    }

    /**
     * Parse content for tool calls
     */
    parseContentForToolCalls(content) {
        const toolCalls = [];
        let remainingText = content;
        
        // Parse tool call patterns that Claude generates
        const patterns = [
            // computer_action: click x, y (both with/without parens)
            { 
                pattern: /computer_action:\s*click\s*\(?(\d+),?\s*(\d+)\)?/g, 
                tool: 'computer_action', 
                type: 'click',
                parse: (match) => ({
                    action: {
                        type: 'click',
                        x: parseInt(match[1]),
                        y: parseInt(match[2])
                    },
                    reasoning: `Clicking at coordinates (${match[1]}, ${match[2]})`
                })
            },
            // computer_action: click, x, y (comma-separated format)
            { 
                pattern: /computer_action:\s*click,\s*(\d+),\s*(\d+)/g, 
                tool: 'computer_action', 
                type: 'click',
                parse: (match) => ({
                    action: {
                        type: 'click',
                        x: parseInt(match[1]),
                        y: parseInt(match[2])
                    },
                    reasoning: `Clicking at coordinates (${match[1]}, ${match[2]})`
                })
            },
            // computer_action: click({"x": n, "y": n}) - JSON format
            { 
                pattern: /computer_action:\s*click\s*\(\s*\{[^}]*"x":\s*(\d+)[^}]*"y":\s*(\d+)[^}]*\}\s*\)/g, 
                tool: 'computer_action', 
                type: 'click',
                parse: (match) => ({
                    action: {
                        type: 'click',
                        x: parseInt(match[1]),
                        y: parseInt(match[2])
                    },
                    reasoning: `Clicking at coordinates (${match[1]}, ${match[2]})`
                })
            },
            // computer_action: type "text" (both with/without parens)
            { 
                pattern: /computer_action:\s*type\s*\(?"([^"]+)"\)?/g, 
                tool: 'computer_action', 
                type: 'type',
                parse: (match) => ({
                    action: {
                        type: 'type',
                        text: match[1]
                    },
                    reasoning: `Typing text: ${match[1]}`
                })
            },
            // computer_action: type, "text" (comma-separated format)
            { 
                pattern: /computer_action:\s*type,\s*"([^"]+)"/g, 
                tool: 'computer_action', 
                type: 'type',
                parse: (match) => ({
                    action: {
                        type: 'type',
                        text: match[1]
                    },
                    reasoning: `Typing text: ${match[1]}`
                })
            },
            // computer_action: type({"text": "..."}) - JSON format
            { 
                pattern: /computer_action:\s*type\s*\(\s*\{[^}]*"text":\s*"([^"]+)"[^}]*\}\s*\)/g, 
                tool: 'computer_action', 
                type: 'type',
                parse: (match) => ({
                    action: {
                        type: 'type',
                        text: match[1]
                    },
                    reasoning: `Typing text: ${match[1]}`
                })
            },
            // computer_action: keypress "key" (both with/without parens)
            { 
                pattern: /computer_action:\s*keypress\s*\(?"([^"]+)"\)?/g, 
                tool: 'computer_action', 
                type: 'keypress',
                parse: (match) => ({
                    action: {
                        type: 'keypress',
                        keys: [match[1]]
                    },
                    reasoning: `Pressing key: ${match[1]}`
                })
            },
            // computer_action: keypress, "key" (comma-separated format)
            { 
                pattern: /computer_action:\s*keypress,\s*"([^"]+)"/g, 
                tool: 'computer_action', 
                type: 'keypress',
                parse: (match) => ({
                    action: {
                        type: 'keypress',
                        keys: [match[1]]
                    },
                    reasoning: `Pressing key: ${match[1]}`
                })
            },
            // computer_action: keypress({"key": "..."}) - JSON format
            { 
                pattern: /computer_action:\s*keypress\s*\(\s*\{[^}]*"key":\s*"([^"]+)"[^}]*\}\s*\)/g, 
                tool: 'computer_action', 
                type: 'keypress',
                parse: (match) => ({
                    action: {
                        type: 'keypress',
                        keys: [match[1]]
                    },
                    reasoning: `Pressing key: ${match[1]}`
                })
            },
            // computer_action: wait n (both with/without parens)
            { 
                pattern: /computer_action:\s*wait\s*\(?(\d+(?:\.\d+)?)\)?/g, 
                tool: 'wait', 
                type: 'wait',
                parse: (match) => ({
                    duration: parseFloat(match[1])
                })
            },
            // wait: n (direct wait format)
            { 
                pattern: /wait:\s*(\d+(?:\.\d+)?)/g, 
                tool: 'wait', 
                type: 'wait',
                parse: (match) => ({
                    duration: parseFloat(match[1])
                })
            },
            // computer_action: screenshot() - takes a new screenshot
            { 
                pattern: /computer_action:\s*screenshot\s*\(\s*\)/g, 
                tool: 'computer_action', 
                type: 'screenshot',
                parse: (match) => ({
                    action: {
                        type: 'screenshot'
                    },
                    reasoning: `Taking a screenshot to analyze current content`
                })
            },
            // computer_action: keypress <key> - inline keypress format
            { 
                pattern: /computer_action:\s*keypress\s*<([^>]+)>/g, 
                tool: 'computer_action', 
                type: 'keypress',
                parse: (match) => ({
                    action: {
                        type: 'keypress',
                        keys: [match[1]]
                    },
                    reasoning: `Pressing key: ${match[1]}`
                })
            },
            // Standalone keypress <key> format
            { 
                pattern: /keypress\s*<([^>]+)>/g, 
                tool: 'computer_action', 
                type: 'keypress',
                parse: (match) => ({
                    action: {
                        type: 'keypress',
                        keys: [match[1]]
                    },
                    reasoning: `Pressing key: ${match[1]}`
                })
            },
            // Standalone screenshot command
            { 
                pattern: /(?:^|\n)computer_action:\s*screenshot\s*$/gm, 
                tool: 'computer_action', 
                type: 'screenshot',
                parse: (match) => ({
                    action: {
                        type: 'screenshot'
                    },
                    reasoning: `Taking a screenshot to analyze current content`
                })
            },
            // memory store commands - both computer_action: and direct patterns
            { 
                pattern: /(?:computer_action:\s*)?memory:\s*store\s+"([^"]+)"\s+(.*)/g, 
                tool: 'memory', 
                type: 'memory',
                parse: (match) => ({
                    action: 'store',
                    key: match[1],
                    value: match[2]
                })
            },
            // complete_task with JSON - both computer_action: and direct patterns
            { 
                pattern: /(?:computer_action:\s*)?complete_task:\s*(\{[\s\S]*?\})/g, 
                tool: 'complete_task', 
                type: 'complete_task',
                parse: (match) => {
                    try {
                        const taskData = JSON.parse(match[1]);
                        return {
                            completionSummary: taskData.summary || "Task completed",
                            verificationEvidence: taskData.evidence || "Task completion requested",
                            finalStateDescription: taskData.finalState || taskData.final_state || "Final state as described"
                        };
                    } catch (e) {
                        return {
                            completionSummary: "Task completed",
                            verificationEvidence: "Task completion requested",
                            finalStateDescription: "Final state as described"
                        };
                    }
                }
            },
            // complete_task with comma-separated format: computer_action: complete_task, { ... }
            { 
                pattern: /(?:computer_action:\s*)?complete_task,\s*(\{[\s\S]*?\})/g, 
                tool: 'complete_task', 
                type: 'complete_task',
                parse: (match) => {
                    try {
                        const taskData = JSON.parse(match[1]);
                        return {
                            completionSummary: taskData.summary || "Task completed",
                            verificationEvidence: taskData.evidence || "Task completion requested",
                            finalStateDescription: taskData.finalState || taskData.final_state || "Final state as described"
                        };
                    } catch (e) {
                        return {
                            completionSummary: "Task completed",
                            verificationEvidence: "Task completion requested",
                            finalStateDescription: "Final state as described"
                        };
                    }
                }
            },
            // Simple complete_task pattern without JSON
            { 
                pattern: /(?:computer_action:\s*)?complete_task/g, 
                tool: 'complete_task', 
                type: 'complete_task',
                parse: (match) => ({
                    completionSummary: "Task completed",
                    verificationEvidence: "Task completion requested",
                    finalStateDescription: "Final state as described"
                })
            }
        ];
        
        // Also parse the XML-style patterns for backward compatibility
        const xmlPatterns = [
            { pattern: /<click>(\d+),\s*(\d+)<\/click>/g, tool: 'computer_action', type: 'click' },
            { pattern: /<type>"?([^"<]*)"?<\/type>/g, tool: 'computer_action', type: 'type' },
            { pattern: /<keypress>"?([^"<]*)"?<\/keypress>/g, tool: 'computer_action', type: 'keypress' },
            { pattern: /<wait>(\d+(?:\.\d+)?)<\/wait>/g, tool: 'wait', type: 'wait' }
        ];
        
        // Process both pattern sets
        for (const { pattern, tool, type, parse } of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const args = parse ? parse(match) : {};
                
                toolCalls.push({
                    toolCallId: `tool_${Date.now()}_${toolCalls.length}`,
                    toolName: tool,
                    args: args
                });
                
                remainingText = remainingText.replace(match[0], '');
            }
        }
        
        // Process XML patterns
        for (const { pattern, tool, type } of xmlPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                let args = {};
                
                if (type === 'click') {
                    args = {
                        action: {
                            type: 'click',
                            x: parseInt(match[1]),
                            y: parseInt(match[2])
                        },
                        reasoning: `Clicking at coordinates (${match[1]}, ${match[2]})`
                    };
                } else if (type === 'type') {
                    args = {
                        action: {
                            type: 'type',
                            text: match[1]
                        },
                        reasoning: `Typing text: ${match[1]}`
                    };
                } else if (type === 'keypress') {
                    args = {
                        action: {
                            type: 'keypress',
                            keys: [match[1]]
                        },
                        reasoning: `Pressing key: ${match[1]}`
                    };
                } else if (type === 'wait') {
                    args = {
                        duration: parseFloat(match[1])
                    };
                }
                
                toolCalls.push({
                    toolCallId: `tool_${Date.now()}_${toolCalls.length}`,
                    toolName: tool,
                    args: args
                });
                
                remainingText = remainingText.replace(match[0], '');
            }
        }
        
        // Clean up remaining text
        remainingText = remainingText.trim();
        
        if (toolCalls.length > 0) {
            console.log('[AnthropicAdapter] Parsed tool calls:', toolCalls);
            return { text: remainingText, toolCalls };
        }
        
        return { text: content, toolCalls: [] };
    }

    /**
     * Convert Zod schema to JSON Schema properties
     */
    zodSchemaToProperties(schema) {
        // Handle common Zod schema types
        if (schema._def) {
            const def = schema._def;
            
            if (def.typeName === 'ZodObject') {
                const properties = {};
                for (const [key, value] of Object.entries(def.shape())) {
                    properties[key] = this.zodToJsonSchema(value);
                }
                return properties;
            } else if (def.typeName === 'ZodUnion') {
                // For union types like computer actions
                const schemas = def.options.map(option => this.zodToJsonSchema(option));
                return {
                    oneOf: schemas
                };
            }
        }
        
        return this.zodToJsonSchema(schema);
    }

    /**
     * Convert individual Zod type to JSON Schema
     */
    zodToJsonSchema(schema) {
        if (!schema._def) {
            return { type: "string" };
        }
        
        const def = schema._def;
        
        switch (def.typeName) {
            case 'ZodString':
                return { type: "string", description: def.description };
            case 'ZodNumber':
                return { type: "number", description: def.description };
            case 'ZodBoolean':
                return { type: "boolean", description: def.description };
            case 'ZodArray':
                return { 
                    type: "array", 
                    items: this.zodToJsonSchema(def.type),
                    description: def.description 
                };
            case 'ZodObject':
                const properties = {};
                const required = [];
                for (const [key, value] of Object.entries(def.shape())) {
                    properties[key] = this.zodToJsonSchema(value);
                    if (!value.isOptional()) {
                        required.push(key);
                    }
                }
                return { 
                    type: "object", 
                    properties, 
                    required,
                    description: def.description 
                };
            case 'ZodEnum':
                return { 
                    type: "string", 
                    enum: def.values,
                    description: def.description 
                };
            case 'ZodLiteral':
                return { 
                    type: "string", 
                    enum: [def.value],
                    description: def.description 
                };
            case 'ZodUnion':
                return {
                    oneOf: def.options.map(option => this.zodToJsonSchema(option)),
                    description: def.description
                };
            default:
                return { type: "string", description: def.description };
        }
    }

    /**
     * Get required properties from Zod schema
     */
    getRequiredProperties(schema) {
        if (schema._def && schema._def.typeName === 'ZodObject') {
            const required = [];
            for (const [key, value] of Object.entries(schema._def.shape())) {
                if (!value.isOptional()) {
                    required.push(key);
                }
            }
            return required;
        }
        return [];
    }
}

module.exports = AnthropicAdapter;