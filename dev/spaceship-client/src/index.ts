/**
 * TypeScript client for agent-daemon
 * Provides easy integration with Spaceship Electron app
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';
import { EventEmitter } from 'events';

export interface AgentOptions {
  host?: string;
  port?: number;
  apiKey?: string;
}

export interface TaskOptions {
  headless?: boolean;
  fast?: boolean;
  timeout?: number;
  [key: string]: any;
}

export interface TaskResponse {
  id: string;
  task: string;
  created_at: string;
}

export interface AgentEvent {
  type: 'progress' | 'screenshot' | 'done' | 'error';
  data: any;
  timestamp: string;
}

export interface Session {
  id: string;
  task: string;
  status: 'running' | 'completed' | 'failed';
  created_at: string;
  events: AgentEvent[];
}

export class AgentClient extends EventEmitter {
  private baseUrl: string;
  private wsUrl: string;
  private activeConnections: Map<string, WebSocket> = new Map();

  constructor(options: AgentOptions = {}) {
    super();
    const host = options.host || '127.0.0.1';
    const port = options.port || 4823;
    this.baseUrl = `http://${host}:${port}`;
    this.wsUrl = `ws://${host}:${port}`;
  }

  /**
   * Check if the daemon is running
   */
  async health(): Promise<{
    ok: boolean;
    port: number;
    host: string;
    sessions: number;
    active_websockets: number;
  }> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return response.json() as any;
  }

  /**
   * Run a browser automation task
   */
  async runTask(task: string, options: TaskOptions = {}): Promise<TaskResponse> {
    const response = await fetch(`${this.baseUrl}/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, options })
    });

    if (!response.ok) {
      throw new Error(`Failed to run task: ${response.statusText}`);
    }

    return response.json() as any;
  }

  /**
   * Subscribe to task events via WebSocket
   */
  subscribeToEvents(sessionId: string, callbacks: {
    onProgress?: (data: any) => void;
    onScreenshot?: (data: any) => void;
    onDone?: (data: any) => void;
    onError?: (data: any) => void;
    onEvent?: (event: AgentEvent) => void;
  }): WebSocket {
    const ws = new WebSocket(`${this.wsUrl}/events?id=${sessionId}`);

    ws.on('message', (data) => {
      try {
        const event: AgentEvent = JSON.parse(data.toString());
        
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
        this.emit('event', { sessionId, event });
        this.emit(event.type, { sessionId, data: event.data });

      } catch (error) {
        console.error('Failed to parse event:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', { sessionId, error });
    });

    ws.on('close', () => {
      this.activeConnections.delete(sessionId);
      this.emit('close', { sessionId });
    });

    this.activeConnections.set(sessionId, ws);
    return ws;
  }

  /**
   * Run a task and subscribe to events in one call
   */
  async runWithEvents(
    task: string,
    options: TaskOptions = {},
    callbacks: Parameters<typeof AgentClient.prototype.subscribeToEvents>[1] = {}
  ): Promise<{ response: TaskResponse; ws: WebSocket }> {
    const response = await this.runTask(task, options);
    const ws = this.subscribeToEvents(response.id, callbacks);
    return { response, ws };
  }

  /**
   * Get all sessions
   */
  async getSessions(): Promise<{ sessions: Session[] }> {
    const response = await fetch(`${this.baseUrl}/agent/sessions`);
    if (!response.ok) {
      throw new Error(`Failed to get sessions: ${response.statusText}`);
    }
    return response.json() as any;
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string): Promise<Session> {
    const response = await fetch(`${this.baseUrl}/agent/session/${sessionId}`);
    if (!response.ok) {
      throw new Error(`Failed to get session: ${response.statusText}`);
    }
    return response.json() as any;
  }

  /**
   * Quick search helper
   */
  async search(query: string, engine: 'google' | 'bing' = 'google'): Promise<TaskResponse> {
    const response = await fetch(`${this.baseUrl}/agent/search?query=${encodeURIComponent(query)}&engine=${engine}`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json() as any;
  }

  /**
   * Close all WebSocket connections
   */
  closeAll(): void {
    for (const [sessionId, ws] of this.activeConnections) {
      ws.close();
    }
    this.activeConnections.clear();
  }

  /**
   * Close specific WebSocket connection
   */
  close(sessionId: string): void {
    const ws = this.activeConnections.get(sessionId);
    if (ws) {
      ws.close();
      this.activeConnections.delete(sessionId);
    }
  }
}

/**
 * Electron main process integration helper
 */
export class AgentDaemonManager {
  private client: AgentClient;
  private pythonProcess: any = null;

  constructor(private options: AgentOptions = {}) {
    this.client = new AgentClient(options);
  }

  /**
   * Start the Python daemon (requires Python environment)
   */
  async start(): Promise<void> {
    // Check if already running
    try {
      const health = await this.client.health();
      if (health.ok) {
        console.log('Agent daemon already running');
        return;
      }
    } catch {}

    // Start Python daemon
    const { spawn } = await import('child_process');
    const pythonPath = process.env.PYTHON_PATH || 'python';
    const daemonPath = process.env.AGENT_DAEMON_PATH || '../agent-daemon-py/server.py';

    this.pythonProcess = spawn(pythonPath, [daemonPath], {
      env: {
        ...process.env,
        AGENT_PORT: String(this.options.port || 4823),
        AGENT_HOST: this.options.host || '127.0.0.1'
      }
    });

    this.pythonProcess.stdout?.on('data', (data: Buffer) => {
      console.log('[Agent Daemon]', data.toString());
    });

    this.pythonProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Agent Daemon Error]', data.toString());
    });

    this.pythonProcess.on('exit', (code: number) => {
      console.log(`Agent daemon exited with code ${code}`);
      this.pythonProcess = null;
    });

    // Wait for daemon to be ready
    await this.waitForReady();
  }

  private async waitForReady(timeout = 10000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const health = await this.client.health();
        if (health.ok) {
          console.log('Agent daemon ready');
          return;
        }
      } catch {}
      
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    throw new Error('Agent daemon failed to start');
  }

  /**
   * Stop the Python daemon
   */
  stop(): void {
    this.client.closeAll();
    
    if (this.pythonProcess) {
      this.pythonProcess.kill('SIGTERM');
      this.pythonProcess = null;
    }
  }

  /**
   * Get the client instance
   */
  getClient(): AgentClient {
    return this.client;
  }
}

// Export everything
export default AgentClient;