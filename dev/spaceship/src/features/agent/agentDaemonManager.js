/**
 * Agent Daemon Manager for Spaceship
 * Manages the browser automation agent integration
 */

const { spawn } = require('child_process');
const path = require('path');
const fetch = require('node-fetch');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

class AgentDaemonManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this.host = options.host || '127.0.0.1';
        this.port = options.port || 4823;
        this.baseUrl = `http://${this.host}:${this.port}`;
        this.wsUrl = `ws://${this.host}:${this.port}`;
        this.pythonProcess = null;
        this.activeConnections = new Map();
        this.isRunning = false;
    }

    /**
     * Check if the daemon is running
     */
    async health() {
        try {
            const response = await fetch(`${this.baseUrl}/health`, {
                timeout: 3000
            });
            if (!response.ok) {
                throw new Error(`Health check failed: ${response.statusText}`);
            }
            const data = await response.json();
            this.isRunning = data.ok;
            return data;
        } catch (error) {
            this.isRunning = false;
            throw new Error(`Agent daemon not available: ${error.message}`);
        }
    }

    /**
     * Start the Python daemon process
     */
    async start() {
        console.log('[AgentDaemon] Starting browser agent daemon...');
        
        // Check if already running externally
        try {
            const health = await this.health();
            if (health.ok) {
                console.log('[AgentDaemon] Daemon already running externally');
                this.isRunning = true;
                return true;
            }
        } catch {}

        // Try to start the daemon process
        try {
            const agentPath = this.getAgentPath();
            console.log('[AgentDaemon] Starting Python server at:', agentPath);

            this.pythonProcess = spawn('python', [agentPath], {
                env: {
                    ...process.env,
                    AGENT_PORT: String(this.port),
                    AGENT_HOST: this.host
                },
                stdio: ['ignore', 'pipe', 'pipe']
            });

            this.pythonProcess.stdout?.on('data', (data) => {
                console.log('[AgentDaemon]', data.toString().trim());
            });

            this.pythonProcess.stderr?.on('data', (data) => {
                console.error('[AgentDaemon Error]', data.toString().trim());
            });

            this.pythonProcess.on('exit', (code) => {
                console.log(`[AgentDaemon] Process exited with code ${code}`);
                this.pythonProcess = null;
                this.isRunning = false;
                this.emit('daemon-stopped', { code });
            });

            // Wait for daemon to be ready
            await this.waitForReady(10000);
            this.isRunning = true;
            console.log('[AgentDaemon] Successfully started');
            return true;

        } catch (error) {
            console.error('[AgentDaemon] Failed to start:', error);
            this.isRunning = false;
            return false;
        }
    }

    /**
     * Get the path to the agent daemon script
     */
    getAgentPath() {
        // In development, use the local path
        if (process.env.NODE_ENV === 'development') {
            return path.join(__dirname, '../../../../agent-daemon-py/server_simple.py');
        }
        
        // In production, look for bundled agent
        const { app } = require('electron');
        return path.join(process.resourcesPath, 'agent', 'server_simple.py');
    }

    /**
     * Wait for daemon to be ready
     */
    async waitForReady(timeoutMs = 10000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            try {
                const health = await this.health();
                if (health.ok) {
                    return true;
                }
            } catch {}
            
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        
        throw new Error('Agent daemon failed to start within timeout');
    }

    /**
     * Run a browser automation task
     */
    async runTask(task, options = {}) {
        if (!this.isRunning) {
            throw new Error('Agent daemon is not running');
        }

        try {
            const response = await fetch(`${this.baseUrl}/agent/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task, options })
            });

            if (!response.ok) {
                throw new Error(`Failed to run task: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[AgentDaemon] Task execution failed:', error);
            throw error;
        }
    }

    /**
     * Subscribe to task events via WebSocket
     */
    subscribeToEvents(sessionId, callbacks = {}) {
        const ws = new WebSocket(`${this.wsUrl}/events?id=${sessionId}`);

        ws.on('message', (data) => {
            try {
                const event = JSON.parse(data.toString());
                
                // Call specific callbacks
                switch (event.type) {
                    case 'progress':
                        callbacks.onProgress?.(event.data);
                        break;
                    case 'screenshot':
                        callbacks.onScreenshot?.(event.data);
                        break;
                    case 'done':
                        callbacks.onDone?.(event.data);
                        break;
                    case 'error':
                        callbacks.onError?.(event.data);
                        break;
                }

                // Call general event callback
                callbacks.onEvent?.(event);

                // Emit event for EventEmitter
                this.emit('agent-event', { sessionId, event });

            } catch (error) {
                console.error('[AgentDaemon] Failed to parse event:', error);
            }
        });

        ws.on('error', (error) => {
            console.error('[AgentDaemon] WebSocket error:', error);
            this.emit('websocket-error', { sessionId, error });
        });

        ws.on('close', () => {
            this.activeConnections.delete(sessionId);
            this.emit('websocket-closed', { sessionId });
        });

        this.activeConnections.set(sessionId, ws);
        return ws;
    }

    /**
     * Run a task and subscribe to events in one call
     */
    async runWithEvents(task, options = {}, callbacks = {}) {
        const response = await this.runTask(task, options);
        const ws = this.subscribeToEvents(response.id, callbacks);
        return { response, ws };
    }

    /**
     * Get all sessions
     */
    async getSessions() {
        if (!this.isRunning) {
            throw new Error('Agent daemon is not running');
        }

        const response = await fetch(`${this.baseUrl}/agent/sessions`);
        if (!response.ok) {
            throw new Error(`Failed to get sessions: ${response.statusText}`);
        }
        return response.json();
    }

    /**
     * Get a specific session by ID
     */
    async getSession(sessionId) {
        if (!this.isRunning) {
            throw new Error('Agent daemon is not running');
        }

        const response = await fetch(`${this.baseUrl}/agent/session/${sessionId}`);
        if (!response.ok) {
            throw new Error(`Failed to get session: ${response.statusText}`);
        }
        return response.json();
    }

    /**
     * Quick search helper
     */
    async search(query, engine = 'google') {
        return this.runTask(`search for ${query}`, { 
            headless: false, 
            keep_open: false 
        });
    }

    /**
     * Navigate to URL
     */
    async navigate(url) {
        return this.runTask(`navigate to ${url}`, { 
            headless: false, 
            keep_open: true 
        });
    }

    /**
     * Stop the daemon
     */
    stop() {
        console.log('[AgentDaemon] Stopping daemon...');
        
        // Close all WebSocket connections
        for (const [sessionId, ws] of this.activeConnections) {
            try {
                ws.close();
            } catch {}
        }
        this.activeConnections.clear();

        // Stop Python process
        if (this.pythonProcess) {
            this.pythonProcess.kill('SIGTERM');
            this.pythonProcess = null;
        }

        this.isRunning = false;
        console.log('[AgentDaemon] Stopped');
    }

    /**
     * Get daemon status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            host: this.host,
            port: this.port,
            activeConnections: this.activeConnections.size,
            hasProcess: !!this.pythonProcess
        };
    }
}

module.exports = AgentDaemonManager;