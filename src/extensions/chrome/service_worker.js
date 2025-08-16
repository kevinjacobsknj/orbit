/**
 * Brdy Orbit Chrome Extension - Service Worker
 * Handles communication between Orbit app and content scripts
 */

class BrdyOrbitServiceWorker {
    constructor() {
        this.activeTabs = new Map();
        this.pendingRequests = new Map();
        this.setupListeners();
    }

    setupListeners() {
        // Listen for messages from content scripts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleContentScriptMessage(message, sender, sendResponse);
            return true; // Keep message channel open
        });

        // Listen for external messages from Orbit app
        chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
            this.handleExternalMessage(message, sender, sendResponse);
            return true;
        });

        // Tab updates
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete') {
                this.activeTabs.set(tabId, {
                    url: tab.url,
                    title: tab.title,
                    timestamp: Date.now()
                });
            }
        });

        chrome.tabs.onRemoved.addListener((tabId) => {
            this.activeTabs.delete(tabId);
        });
    }

    async handleContentScriptMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'content_script_ready':
                console.log(`[Brdy Orbit] Content script ready on: ${message.url}`);
                if (sender.tab) {
                    this.activeTabs.set(sender.tab.id, {
                        url: sender.tab.url,
                        title: sender.tab.title,
                        timestamp: Date.now(),
                        hasContentScript: true
                    });
                }
                sendResponse({ success: true });
                break;

            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    }

    async handleExternalMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'get_context':
                    const context = await this.getPageContext(message.tabId);
                    sendResponse({ success: true, data: context });
                    break;

                case 'fill_google_sheets':
                    const fillResult = await this.fillGoogleSheets(message.tabId, message.data);
                    sendResponse({ success: true, data: fillResult });
                    break;

                case 'fill_fields':
                    const fieldResult = await this.fillFormFields(message.tabId, message.pairs);
                    sendResponse({ success: true, data: fieldResult });
                    break;

                case 'copy_to_clipboard':
                    await this.copyToClipboard(message.tabId, message.text);
                    sendResponse({ success: true });
                    break;

                case 'get_active_tabs':
                    const tabs = await this.getActiveTabs();
                    sendResponse({ success: true, data: tabs });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('[Brdy Orbit] Service worker error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async getPageContext(tabId) {
        const tab = await this.getActiveTab(tabId);
        if (!tab) {
            throw new Error('Tab not found or not accessible');
        }

        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tab.id, { action: 'get_context' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response?.error || 'Failed to get context'));
                }
            });
        });
    }

    async fillGoogleSheets(tabId, data) {
        const tab = await this.getActiveTab(tabId);
        if (!tab) {
            throw new Error('Tab not found or not accessible');
        }

        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'fill_google_sheets',
                data: data
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response?.error || 'Failed to fill sheets'));
                }
            });
        });
    }

    async fillFormFields(tabId, pairs) {
        const tab = await this.getActiveTab(tabId);
        if (!tab) {
            throw new Error('Tab not found or not accessible');
        }

        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'fill_fields',
                pairs: pairs
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response?.error || 'Failed to fill fields'));
                }
            });
        });
    }

    async copyToClipboard(tabId, text) {
        const tab = await this.getActiveTab(tabId);
        if (!tab) {
            throw new Error('Tab not found or not accessible');
        }

        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'copy_to_clipboard',
                text: text
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.success) {
                    resolve();
                } else {
                    reject(new Error(response?.error || 'Failed to copy to clipboard'));
                }
            });
        });
    }

    async getActiveTab(tabId) {
        if (tabId) {
            try {
                return await chrome.tabs.get(tabId);
            } catch (error) {
                return null;
            }
        }

        // Get current active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return tabs[0] || null;
    }

    async getActiveTabs() {
        const tabs = await chrome.tabs.query({});
        const supportedTabs = tabs
            .filter(tab => this.isSupportedUrl(tab.url))
            .map(tab => ({
                id: tab.id,
                url: tab.url,
                title: tab.title,
                hasContentScript: this.activeTabs.get(tab.id)?.hasContentScript || false
            }));
        
        // Also notify Orbit app about available tabs via HTTP
        this.notifyOrbitApp('tabs_available', supportedTabs);
        
        return supportedTabs;
    }

    isSupportedUrl(url) {
        const supportedDomains = [
            'docs.google.com',
            'sheets.google.com',
            'salesforce.com',
            'hubspot.com'
        ];

        return supportedDomains.some(domain => url.includes(domain));
    }

    // Utility methods
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async notifyOrbitApp(action, data) {
        const orbitPorts = [55556, 55555, 55557];
        
        for (const port of orbitPorts) {
            try {
                const response = await fetch(`http://localhost:${port}/extension/message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: action,
                        data: data,
                        requestId: this.generateRequestId()
                    })
                });
                
                if (response.ok) {
                    console.log(`[Brdy Orbit] Successfully notified Orbit app on port ${port}`);
                    return await response.json();
                }
            } catch (error) {
                console.log(`[Brdy Orbit] Failed to connect to port ${port}:`, error.message);
            }
        }
        
        console.log('[Brdy Orbit] Could not connect to Orbit app');
        return null;
    }

    logActivity(action, tabId, data) {
        console.log(`[Brdy Orbit] ${action} on tab ${tabId}:`, data);
        
        // Store activity log (could be useful for debugging/analytics)
        chrome.storage.local.get(['activityLog'], (result) => {
            const log = result.activityLog || [];
            log.push({
                timestamp: Date.now(),
                action,
                tabId,
                data: JSON.stringify(data).substring(0, 200) // Truncate for storage
            });

            // Keep only last 100 entries
            const trimmedLog = log.slice(-100);
            chrome.storage.local.set({ activityLog: trimmedLog });
        });
    }
}

// Initialize service worker
const brdyOrbitServiceWorker = new BrdyOrbitServiceWorker();

// Proactively check for supported tabs and notify Orbit app
setTimeout(async () => {
    try {
        console.log('[Brdy Orbit] Proactively checking for supported tabs...');
        const tabs = await brdyOrbitServiceWorker.getActiveTabs();
        console.log('[Brdy Orbit] Found supported tabs:', tabs);
    } catch (error) {
        console.log('[Brdy Orbit] Error during proactive tab check:', error);
    }
}, 2000);