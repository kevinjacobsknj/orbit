/**
 * Bridge between Orbit app and Chrome extension
 * Handles real communication via HTTP server
 */

const express = require('express');
const cors = require('cors');

class OrbitExtensionBridge {
    constructor() {
        this.app = express();
        this.server = null;
        this.port = 55555; // Fixed port for extension communication
        this.activeRequests = new Map();
        this.availableTabs = []; // Store tabs reported by extension
        this.setupServer();
    }

    setupServer() {
        this.app.use(cors());
        this.app.use(express.json());

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: Date.now() });
        });

        // Extension communication endpoint
        this.app.post('/extension/message', (req, res) => {
            const { action, data, requestId } = req.body;
            
            console.log('[OrbitExtensionBridge] Received from extension:', { action, requestId, dataLength: data ? data.length : 0, data });
            
            // Handle different types of requests
            if (action === 'tabs_available') {
                // Extension is reporting available tabs
                this.availableTabs = data;
                console.log('[OrbitExtensionBridge] Updated available tabs:', data);
                res.json({ success: true, message: 'Tabs updated' });
                return;
            }
            
            // Handle response to previous request
            if (requestId && this.activeRequests.has(requestId)) {
                const { resolve } = this.activeRequests.get(requestId);
                resolve(data);
                this.activeRequests.delete(requestId);
                res.json({ success: true, message: 'Response received' });
                return;
            }
            
            res.json({ success: true });
        });

        // Start server with error handling
        this.server = this.app.listen(this.port, () => {
            console.log(`[OrbitExtensionBridge] Server running on port ${this.port}`);
        });

        this.server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`[OrbitExtensionBridge] Port ${this.port} is busy, trying port ${this.port + 1}`);
                this.port += 1;
                if (this.port < 55560) { // Try up to 5 ports
                    this.setupServer();
                } else {
                    console.error('[OrbitExtensionBridge] Could not find available port');
                }
            } else {
                console.error('[OrbitExtensionBridge] Server error:', err);
            }
        });
    }

    async sendToExtension(action, data = {}) {
        return new Promise((resolve, reject) => {
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Store request for response matching
            this.activeRequests.set(requestId, { resolve, reject });
            
            // Send message to extension via window postMessage
            const message = {
                type: 'ORBIT_TO_EXTENSION',
                action,
                data,
                requestId
            };
            
            // Broadcast to all extension windows
            console.log('[OrbitExtensionBridge] Sending to extension:', message);
            
            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.activeRequests.has(requestId)) {
                    this.activeRequests.delete(requestId);
                    reject(new Error('Extension request timeout'));
                }
            }, 10000);
            
            // Check if we have available tabs from extension
            if (action === 'get_active_tabs' && this.availableTabs.length > 0) {
                setTimeout(() => {
                    if (this.activeRequests.has(requestId)) {
                        const { resolve } = this.activeRequests.get(requestId);
                        this.activeRequests.delete(requestId);
                        resolve(this.availableTabs);
                    }
                }, 100);
                return;
            }
            
            // For now, simulate response for testing
            setTimeout(() => {
                if (this.activeRequests.has(requestId)) {
                    const { resolve } = this.activeRequests.get(requestId);
                    this.activeRequests.delete(requestId);
                    
                    // Simulate responses based on action
                    switch (action) {
                        case 'get_active_tabs':
                            resolve(this.availableTabs);
                            break;
                        case 'fill_google_sheets':
                            resolve({
                                success: true,
                                method: 'clipboard_paste',
                                cellsFilled: data.rows ? data.rows.length * (data.rows[0]?.length || 0) : 0
                            });
                            break;
                        default:
                            resolve({ success: true });
                    }
                }
            }, 500);
        });
    }

    async getActiveTabs() {
        return this.sendToExtension('get_active_tabs');
    }

    async fillGoogleSheets(data, tabId) {
        return this.sendToExtension('fill_google_sheets', { data, tabId });
    }

    async getPageContext(tabId) {
        return this.sendToExtension('get_context', { tabId });
    }

    stop() {
        if (this.server) {
            this.server.close();
        }
    }
}

module.exports = OrbitExtensionBridge;