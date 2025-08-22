/**
 * Browser Agent Command Interface for Spaceship
 * Provides a command overlay similar to Spaceship's existing UI
 */

class AgentView {
    constructor() {
        this.isVisible = false;
        this.container = null;
        this.input = null;
        this.results = null;
        this.activeSession = null;
        
        this.init();
    }

    init() {
        this.createInterface();
        this.setupEventListeners();
        this.setupAgentEventListeners();
        console.log('[AgentView] Browser agent command interface initialized');
    }

    createInterface() {
        // Create overlay container
        this.container = document.createElement('div');
        this.container.className = 'agent-command-overlay';
        this.container.innerHTML = `
            <div class="agent-command-box">
                <div class="agent-header">
                    <div class="agent-title">
                        <span class="agent-icon">🤖</span>
                        <h3>Browser Agent</h3>
                        <span class="agent-status" id="agent-status">●</span>
                    </div>
                    <div class="agent-subtitle">
                        Type commands like "search for Python tutorials" or "navigate to github.com"
                    </div>
                </div>
                
                <div class="agent-input-container">
                    <input 
                        class="agent-input" 
                        type="text" 
                        placeholder="Enter browser command..."
                        autocomplete="off"
                    />
                    <div class="agent-input-hint">
                        Press Enter to execute • Esc to close
                    </div>
                </div>
                
                <div class="agent-results" id="agent-results"></div>
                
                <div class="agent-controls">
                    <div class="agent-examples">
                        <button class="agent-example-btn" data-command="search for TypeScript documentation">
                            Search TypeScript docs
                        </button>
                        <button class="agent-example-btn" data-command="navigate to github.com">
                            Go to GitHub
                        </button>
                        <button class="agent-example-btn" data-command="navigate to youtube.com">
                            Open YouTube
                        </button>
                    </div>
                    <div class="agent-shortcuts">
                        Press <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>B</kbd> to toggle
                    </div>
                </div>
            </div>
        `;

        // Add styles
        this.addStyles();
        
        // Get references
        this.input = this.container.querySelector('.agent-input');
        this.results = this.container.querySelector('.agent-results');
        
        // Add to DOM
        document.body.appendChild(this.container);
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .agent-command-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(8px);
                z-index: 10000;
                display: none;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            .agent-command-overlay.visible {
                display: flex;
            }

            .agent-command-box {
                background: #1a1a1a;
                border: 1px solid #333;
                border-radius: 12px;
                width: 700px;
                max-height: 500px;
                padding: 24px;
                color: white;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                animation: slideIn 0.2s ease-out;
            }

            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            .agent-header {
                margin-bottom: 20px;
            }

            .agent-title {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 8px;
            }

            .agent-icon {
                font-size: 20px;
            }

            .agent-title h3 {
                margin: 0;
                color: #4a9eff;
                font-size: 18px;
                font-weight: 600;
            }

            .agent-status {
                font-size: 12px;
                margin-left: auto;
            }

            .agent-status.connected { color: #4ade80; }
            .agent-status.disconnected { color: #ef4444; }
            .agent-status.connecting { color: #facc15; }

            .agent-subtitle {
                font-size: 13px;
                color: #888;
                margin: 0;
            }

            .agent-input-container {
                position: relative;
                margin-bottom: 20px;
            }

            .agent-input {
                width: 100%;
                padding: 16px;
                border: 2px solid #333;
                border-radius: 8px;
                background: #2a2a2a;
                color: white;
                font-size: 15px;
                outline: none;
                transition: border-color 0.2s;
                box-sizing: border-box;
            }

            .agent-input:focus {
                border-color: #4a9eff;
            }

            .agent-input-hint {
                font-size: 11px;
                color: #666;
                margin-top: 6px;
                text-align: right;
            }

            .agent-results {
                max-height: 200px;
                overflow-y: auto;
                font-size: 13px;
                color: #ccc;
                background: #161616;
                border-radius: 6px;
                padding: 12px;
                margin-bottom: 20px;
                display: none;
            }

            .agent-results.has-content {
                display: block;
            }

            .agent-results .result-line {
                padding: 4px 0;
                border-bottom: 1px solid #222;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .agent-results .result-line:last-child {
                border-bottom: none;
            }

            .agent-results .result-icon {
                font-size: 14px;
                width: 20px;
            }

            .agent-results .result-text {
                flex: 1;
            }

            .agent-results .result-time {
                font-size: 11px;
                color: #555;
            }

            .result-line.info { color: #888; }
            .result-line.success { color: #4ade80; }
            .result-line.error { color: #ef4444; }
            .result-line.command { color: #4a9eff; }

            .agent-controls {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 20px;
            }

            .agent-examples {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }

            .agent-example-btn {
                background: #333;
                border: 1px solid #444;
                border-radius: 6px;
                color: #ccc;
                padding: 6px 12px;
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .agent-example-btn:hover {
                background: #444;
                border-color: #555;
                color: white;
            }

            .agent-shortcuts {
                font-size: 11px;
                color: #666;
            }

            .agent-shortcuts kbd {
                background: #333;
                border: 1px solid #555;
                border-radius: 3px;
                padding: 2px 6px;
                font-size: 10px;
                color: #ccc;
            }

            /* Scrollbar styling */
            .agent-results::-webkit-scrollbar {
                width: 6px;
            }

            .agent-results::-webkit-scrollbar-track {
                background: #222;
                border-radius: 3px;
            }

            .agent-results::-webkit-scrollbar-thumb {
                background: #444;
                border-radius: 3px;
            }

            .agent-results::-webkit-scrollbar-thumb:hover {
                background: #555;
            }
        `;
        document.head.appendChild(style);
    }

    setupEventListeners() {
        // Toggle with Ctrl+Alt+B
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.altKey && e.key === 'b') {
                e.preventDefault();
                this.toggle();
            } else if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });

        // Input handling
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.executeCommand(this.input.value.trim());
            }
        });

        // Click outside to close
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) {
                this.hide();
            }
        });

        // Example button clicks
        this.container.addEventListener('click', (e) => {
            if (e.target.classList.contains('agent-example-btn')) {
                const command = e.target.getAttribute('data-command');
                this.input.value = command;
                this.input.focus();
            }
        });
    }

    setupAgentEventListeners() {
        // Listen for agent events from main process
        if (window.electronAPI) {
            window.electronAPI.on('agent-progress', (data) => {
                this.addResult(`📋 ${data.data.step}`, 'info');
            });

            window.electronAPI.on('agent-screenshot', (data) => {
                this.addResult(`📸 Screenshot saved`, 'success');
            });

            window.electronAPI.on('agent-done', (data) => {
                this.addResult(`✅ Task completed successfully!`, 'success');
                if (data.data.result && data.data.result.results) {
                    const results = data.data.result.results;
                    results.slice(0, 3).forEach(r => {
                        this.addResult(`🔗 ${r.title}`, 'info');
                    });
                }
            });

            window.electronAPI.on('agent-error', (data) => {
                this.addResult(`❌ Error: ${data.data.message}`, 'error');
            });

            window.electronAPI.on('agent-status', (data) => {
                this.updateStatus(data);
            });
        }
    }

    async executeCommand(command) {
        if (!command) return;

        this.input.value = '';
        this.addResult(`> ${command}`, 'command');
        this.updateStatus('connecting');

        try {
            let result;

            if (window.electronAPI) {
                if (command.toLowerCase().startsWith('search')) {
                    const query = command.replace(/^search\\s+(?:for\\s+)?/i, '');
                    result = await window.electronAPI.invoke('agent:search', query);
                } else if (command.toLowerCase().startsWith('navigate') || command.toLowerCase().startsWith('go to')) {
                    const url = command.replace(/^(?:navigate\\s+to\\s+|go\\s+to\\s+)/i, '');
                    result = await window.electronAPI.invoke('agent:navigate', url);
                } else if (command.toLowerCase() === 'health') {
                    result = await window.electronAPI.invoke('agent:health');
                    this.addResult(`Server: ${result.ok ? 'Connected' : 'Disconnected'}`, result.ok ? 'success' : 'error');
                    return;
                } else {
                    result = await window.electronAPI.invoke('agent:run-task', command);
                }

                if (result.success) {
                    this.activeSession = result.data.id;
                    this.addResult(`🚀 Task started: ${result.data.id}`, 'success');
                    this.updateStatus('connected');
                    
                    // Subscribe to events
                    await window.electronAPI.invoke('agent:subscribe', result.data.id);
                } else {
                    this.addResult(`❌ Failed: ${result.error}`, 'error');
                    this.updateStatus('disconnected');
                }
            } else {
                this.addResult(`❌ Electron API not available`, 'error');
                this.updateStatus('disconnected');
            }

        } catch (error) {
            this.addResult(`❌ Error: ${error.message}`, 'error');
            this.updateStatus('disconnected');
        }
    }

    addResult(message, type = 'info') {
        const line = document.createElement('div');
        line.className = `result-line ${type}`;
        
        const icons = {
            info: '📋',
            success: '✅',
            error: '❌',
            command: '▶️'
        };

        line.innerHTML = `
            <span class="result-icon">${icons[type]}</span>
            <span class="result-text">${message}</span>
            <span class="result-time">${new Date().toLocaleTimeString()}</span>
        `;
        
        this.results.appendChild(line);
        this.results.classList.add('has-content');
        this.results.scrollTop = this.results.scrollHeight;
    }

    updateStatus(status) {
        const statusEl = this.container.querySelector('#agent-status');
        if (statusEl) {
            statusEl.className = `agent-status ${status}`;
            statusEl.textContent = {
                'connected': '●',
                'disconnected': '○',
                'connecting': '◐'
            }[status] || '○';
        }
    }

    show() {
        this.container.classList.add('visible');
        this.isVisible = true;
        this.input.focus();
        
        // Check agent status
        this.checkAgentHealth();
    }

    hide() {
        this.container.classList.remove('visible');
        this.isVisible = false;
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    async checkAgentHealth() {
        try {
            if (window.electronAPI) {
                const health = await window.electronAPI.invoke('agent:health');
                this.updateStatus(health.ok ? 'connected' : 'disconnected');
            }
        } catch {
            this.updateStatus('disconnected');
        }
    }

    clear() {
        this.results.innerHTML = '';
        this.results.classList.remove('has-content');
    }
}

// Auto-initialize when DOM loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new AgentView();
    });
} else {
    new AgentView();
}

// Export for manual initialization
window.AgentView = AgentView;