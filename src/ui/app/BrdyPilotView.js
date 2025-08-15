import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';

export class BrdyPilotView extends LitElement {
    static properties = {
        isActive: { type: Boolean },
        currentMode: { type: String },
        detectedApp: { type: Object },
        fieldMappings: { type: Object },
        actionHistory: { type: Array },
        isLoading: { type: Boolean },
        status: { type: String }
    };

    static styles = css`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            color: white;
            font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .brdy-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            border-radius: 12px;
            backdrop-filter: blur(10px);
            overflow: hidden;
        }

        .brdy-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            background: rgba(0, 0, 0, 0.3);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .brdy-title {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 16px;
            font-weight: 600;
        }

        .brdy-logo {
            width: 24px;
            height: 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        }

        .brdy-status {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.7);
            padding: 4px 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 12px;
        }

        .brdy-status.active {
            background: rgba(34, 197, 94, 0.2);
            color: #4ade80;
        }

        .brdy-content {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        }

        .mode-selector {
            display: flex;
            gap: 8px;
            margin-bottom: 20px;
        }

        .mode-button {
            flex: 1;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            color: white;
            cursor: pointer;
            transition: all 0.2s ease;
            text-align: center;
            font-size: 14px;
        }

        .mode-button:hover {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.3);
        }

        .mode-button.active {
            background: rgba(34, 197, 94, 0.2);
            border-color: #4ade80;
            color: #4ade80;
        }

        .detection-panel {
            margin-bottom: 20px;
            padding: 16px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .detection-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            font-size: 14px;
            font-weight: 500;
        }

        .detection-icon {
            width: 16px;
            height: 16px;
            background: rgba(59, 130, 246, 0.2);
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
        }

        .detection-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            font-size: 12px;
        }

        .detection-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .detection-label {
            color: rgba(255, 255, 255, 0.6);
            font-weight: 500;
        }

        .detection-value {
            color: rgba(255, 255, 255, 0.9);
        }

        .actions-panel {
            margin-bottom: 20px;
        }

        .actions-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 12px;
        }

        .action-button {
            padding: 16px 12px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            color: white;
            cursor: pointer;
            transition: all 0.2s ease;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }

        .action-button:hover {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(255, 255, 255, 0.25);
            transform: translateY(-1px);
        }

        .action-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .action-icon {
            font-size: 20px;
        }

        .action-label {
            font-size: 12px;
            font-weight: 500;
        }

        .action-description {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.6);
            text-align: center;
        }

        .mappings-panel {
            margin-bottom: 20px;
        }

        .mappings-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .mapping-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .mapping-field {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.9);
            font-weight: 500;
        }

        .mapping-type {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.6);
            background: rgba(255, 255, 255, 0.1);
            padding: 2px 6px;
            border-radius: 10px;
        }

        .history-panel {
            margin-bottom: 20px;
        }

        .history-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 200px;
            overflow-y: auto;
        }

        .history-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 6px;
            font-size: 11px;
        }

        .history-action {
            color: rgba(255, 255, 255, 0.8);
        }

        .history-time {
            color: rgba(255, 255, 255, 0.5);
        }

        .loading-spinner {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px;
        }

        .spinner {
            width: 24px;
            height: 24px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top: 2px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .controls-footer {
            padding: 16px 20px;
            background: rgba(0, 0, 0, 0.3);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            gap: 12px;
        }

        .control-button {
            flex: 1;
            padding: 10px 16px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: white;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 13px;
            font-weight: 500;
        }

        .control-button:hover {
            background: rgba(255, 255, 255, 0.15);
        }

        .control-button.primary {
            background: rgba(34, 197, 94, 0.2);
            border-color: #4ade80;
            color: #4ade80;
        }

        .control-button.primary:hover {
            background: rgba(34, 197, 94, 0.3);
        }

        .panel-header {
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 12px;
            color: rgba(255, 255, 255, 0.9);
        }

        .empty-state {
            text-align: center;
            padding: 20px;
            color: rgba(255, 255, 255, 0.5);
            font-size: 12px;
        }
    `;

    constructor() {
        super();
        this.isActive = false;
        this.currentMode = 'detect';
        this.detectedApp = null;
        this.fieldMappings = {};
        this.actionHistory = [];
        this.isLoading = false;
        this.status = 'Ready';
    }

    connectedCallback() {
        super.connectedCallback();
        
        if (window.api) {
            // Listen for Brdy Pilot events
            window.api.mainHeader.onBrdyPilotStateUpdate?.((event, state) => {
                this.updateState(state);
            });
        }
    }

    updateState(state) {
        this.isActive = state.isActive || false;
        this.detectedApp = state.detectedApp || null;
        this.fieldMappings = state.fieldMappings || {};
        this.actionHistory = state.actionHistory || [];
        this.status = state.status || 'Ready';
    }

    handleModeChange(mode) {
        this.currentMode = mode;
        this.dispatchBrdyPilotEvent('modeChanged', { mode });
    }

    async handleDetectApp() {
        this.isLoading = true;
        this.status = 'Detecting application...';
        
        try {
            const result = await this.dispatchBrdyPilotEvent('detectApp');
            if (result.success) {
                this.detectedApp = result.data;
                this.status = `Detected: ${this.detectedApp.appType}`;
            } else {
                this.status = 'Detection failed';
            }
        } catch (error) {
            this.status = 'Error during detection';
            console.error('App detection failed:', error);
        }
        
        this.isLoading = false;
    }

    async handleMapFields() {
        if (!this.detectedApp) {
            this.status = 'Please detect app first';
            return;
        }

        this.isLoading = true;
        this.status = 'Mapping fields...';
        
        try {
            const result = await this.dispatchBrdyPilotEvent('mapFields', {
                appData: this.detectedApp
            });
            
            if (result.success) {
                this.fieldMappings = result.data.mappings;
                this.status = `Mapped ${Object.keys(this.fieldMappings).length} fields`;
            } else {
                this.status = 'Field mapping failed';
            }
        } catch (error) {
            this.status = 'Error during mapping';
            console.error('Field mapping failed:', error);
        }
        
        this.isLoading = false;
    }

    async handleStartCapture() {
        this.isLoading = true;
        this.status = 'Starting capture...';
        
        try {
            const result = await this.dispatchBrdyPilotEvent('startCapture', {
                mode: 'progressive'
            });
            
            if (result.success) {
                this.status = 'Capture mode active - select elements';
            } else {
                this.status = 'Failed to start capture';
            }
        } catch (error) {
            this.status = 'Error starting capture';
            console.error('Capture start failed:', error);
        }
        
        this.isLoading = false;
    }

    async handleAskAI() {
        this.status = 'Opening AI assistant...';
        
        try {
            await this.dispatchBrdyPilotEvent('askUser', {
                question: 'How can I help you automate this page?',
                context: {
                    detectedApp: this.detectedApp,
                    fieldMappings: this.fieldMappings
                }
            });
        } catch (error) {
            console.error('AI assistant failed:', error);
        }
    }

    async handleFillForm() {
        if (Object.keys(this.fieldMappings).length === 0) {
            this.status = 'No field mappings available';
            return;
        }

        this.isLoading = true;
        this.status = 'Filling form...';
        
        try {
            const result = await this.dispatchBrdyPilotEvent('fillForm', {
                mappings: this.fieldMappings
            });
            
            if (result.success) {
                this.status = `Filled ${result.data.fieldsUpdated} fields`;
                this.addToHistory('Form Fill', result.data.fieldsUpdated + ' fields');
            } else {
                this.status = 'Form fill failed';
            }
        } catch (error) {
            this.status = 'Error filling form';
            console.error('Form fill failed:', error);
        }
        
        this.isLoading = false;
    }

    async handleEmailInsert() {
        this.isLoading = true;
        this.status = 'Inserting email content...';
        
        try {
            const result = await this.dispatchBrdyPilotEvent('emailInsert', {
                content: 'AI-generated email content',
                position: 'append'
            });
            
            if (result.success) {
                this.status = 'Email content inserted';
                this.addToHistory('Email Insert', 'Content added');
            } else {
                this.status = 'Email insert failed';
            }
        } catch (error) {
            this.status = 'Error inserting email';
            console.error('Email insert failed:', error);
        }
        
        this.isLoading = false;
    }

    addToHistory(action, details) {
        this.actionHistory = [
            {
                action,
                details,
                timestamp: new Date().toLocaleTimeString()
            },
            ...this.actionHistory.slice(0, 9) // Keep last 10 items
        ];
    }

    dispatchBrdyPilotEvent(eventType, data = {}) {
        return new Promise((resolve) => {
            if (window.api?.mainHeader?.sendBrdyPilotAction) {
                window.api.mainHeader.sendBrdyPilotAction(eventType, data)
                    .then(resolve)
                    .catch(error => {
                        console.error('Brdy Pilot action failed:', error);
                        resolve({ success: false, error: error.message });
                    });
            } else {
                console.log('Brdy Pilot action (simulated):', eventType, data);
                resolve({ success: true, data: {} });
            }
        });
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString();
    }

    renderDetectionPanel() {
        if (!this.detectedApp) {
            return html`
                <div class="detection-panel">
                    <div class="empty-state">
                        No application detected. Click "Detect App" to analyze the current page.
                    </div>
                </div>
            `;
        }

        return html`
            <div class="detection-panel">
                <div class="detection-header">
                    <div class="detection-icon">🎯</div>
                    Application Detected
                </div>
                <div class="detection-details">
                    <div class="detection-item">
                        <div class="detection-label">Type</div>
                        <div class="detection-value">${this.detectedApp.appType}</div>
                    </div>
                    <div class="detection-item">
                        <div class="detection-label">Confidence</div>
                        <div class="detection-value">${Math.round(this.detectedApp.confidence * 100)}%</div>
                    </div>
                    <div class="detection-item">
                        <div class="detection-label">Capabilities</div>
                        <div class="detection-value">${this.detectedApp.capabilities?.length || 0}</div>
                    </div>
                    <div class="detection-item">
                        <div class="detection-label">Security</div>
                        <div class="detection-value">${this.detectedApp.securityLevel}</div>
                    </div>
                </div>
            </div>
        `;
    }

    renderMappingsPanel() {
        const mappings = Object.entries(this.fieldMappings);
        
        if (mappings.length === 0) {
            return html`
                <div class="mappings-panel">
                    <div class="panel-header">Field Mappings</div>
                    <div class="empty-state">
                        No field mappings available. Detect an app and map fields first.
                    </div>
                </div>
            `;
        }

        return html`
            <div class="mappings-panel">
                <div class="panel-header">Field Mappings (${mappings.length})</div>
                <div class="mappings-list">
                    ${mappings.map(([selector, mapping]) => html`
                        <div class="mapping-item">
                            <div class="mapping-field">${mapping.semantic || selector}</div>
                            <div class="mapping-type">${mapping.type}</div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }

    renderHistoryPanel() {
        if (this.actionHistory.length === 0) {
            return html`
                <div class="history-panel">
                    <div class="panel-header">Action History</div>
                    <div class="empty-state">No actions performed yet.</div>
                </div>
            `;
        }

        return html`
            <div class="history-panel">
                <div class="panel-header">Recent Actions</div>
                <div class="history-list">
                    ${this.actionHistory.map(item => html`
                        <div class="history-item">
                            <div class="history-action">${item.action}: ${item.details}</div>
                            <div class="history-time">${item.timestamp}</div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }

    render() {
        if (this.isLoading) {
            return html`
                <div class="brdy-container">
                    <div class="loading-spinner">
                        <div class="spinner"></div>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="brdy-container">
                <div class="brdy-header">
                    <div class="brdy-title">
                        <div class="brdy-logo">🤖</div>
                        Brdy Pilot
                    </div>
                    <div class="brdy-status ${this.isActive ? 'active' : ''}">${this.status}</div>
                </div>

                <div class="brdy-content">
                    <div class="mode-selector">
                        <button 
                            class="mode-button ${this.currentMode === 'detect' ? 'active' : ''}"
                            @click=${() => this.handleModeChange('detect')}
                        >
                            Detect
                        </button>
                        <button 
                            class="mode-button ${this.currentMode === 'automate' ? 'active' : ''}"
                            @click=${() => this.handleModeChange('automate')}
                        >
                            Automate
                        </button>
                        <button 
                            class="mode-button ${this.currentMode === 'capture' ? 'active' : ''}"
                            @click=${() => this.handleModeChange('capture')}
                        >
                            Capture
                        </button>
                    </div>

                    ${this.renderDetectionPanel()}

                    <div class="actions-panel">
                        <div class="panel-header">Quick Actions</div>
                        <div class="actions-grid">
                            <button class="action-button" @click=${this.handleDetectApp}>
                                <div class="action-icon">🔍</div>
                                <div class="action-label">Detect App</div>
                                <div class="action-description">Analyze current page</div>
                            </button>
                            
                            <button class="action-button" @click=${this.handleMapFields} ?disabled=${!this.detectedApp}>
                                <div class="action-icon">🗺️</div>
                                <div class="action-label">Map Fields</div>
                                <div class="action-description">Identify form fields</div>
                            </button>
                            
                            <button class="action-button" @click=${this.handleStartCapture}>
                                <div class="action-icon">📸</div>
                                <div class="action-label">Capture</div>
                                <div class="action-description">Smart region capture</div>
                            </button>
                            
                            <button class="action-button" @click=${this.handleAskAI}>
                                <div class="action-icon">🤖</div>
                                <div class="action-label">Ask AI</div>
                                <div class="action-description">Get assistance</div>
                            </button>
                            
                            <button class="action-button" @click=${this.handleFillForm} ?disabled=${Object.keys(this.fieldMappings).length === 0}>
                                <div class="action-icon">📝</div>
                                <div class="action-label">Fill Form</div>
                                <div class="action-description">Auto-fill fields</div>
                            </button>
                            
                            <button class="action-button" @click=${this.handleEmailInsert}>
                                <div class="action-icon">✉️</div>
                                <div class="action-label">Email Insert</div>
                                <div class="action-description">Insert content</div>
                            </button>
                        </div>
                    </div>

                    ${this.renderMappingsPanel()}
                    ${this.renderHistoryPanel()}
                </div>

                <div class="controls-footer">
                    <button class="control-button">Settings</button>
                    <button class="control-button">History</button>
                    <button class="control-button primary">Activate</button>
                </div>
            </div>
        `;
    }
}

customElements.define('brdy-pilot-view', BrdyPilotView);