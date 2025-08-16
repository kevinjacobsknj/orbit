/**
 * Brdy Orbit Chrome Extension - Popup Script
 */

class BrdyOrbitPopup {
    constructor() {
        this.currentTab = null;
        this.pageContext = null;
        this.init();
    }

    async init() {
        await this.getCurrentTab();
        await this.checkConnection();
        this.setupEventListeners();
        await this.analyzeCurrentPage();
    }

    async getCurrentTab() {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        this.currentTab = tabs[0];
    }

    async checkConnection() {
        const statusEl = document.getElementById('status');
        
        try {
            // Check if Orbit app is running (this would need actual implementation)
            const isConnected = true; // Placeholder
            
            if (isConnected) {
                statusEl.className = 'status connected';
                statusEl.innerHTML = '✅ Connected to Brdy Orbit';
                this.enableButtons();
            } else {
                statusEl.className = 'status disconnected';
                statusEl.innerHTML = '❌ Brdy Orbit app not detected';
            }
        } catch (error) {
            statusEl.className = 'status disconnected';
            statusEl.innerHTML = '❌ Connection failed';
        }
    }

    enableButtons() {
        document.getElementById('analyzeBtn').disabled = false;
        document.getElementById('fillSheetsBtn').disabled = false;
        document.getElementById('fillFormsBtn').disabled = false;
    }

    setupEventListeners() {
        document.getElementById('analyzeBtn').addEventListener('click', () => {
            this.analyzeCurrentPage();
        });

        document.getElementById('fillSheetsBtn').addEventListener('click', () => {
            this.fillGoogleSheets();
        });

        document.getElementById('fillFormsBtn').addEventListener('click', () => {
            this.fillFormFields();
        });

        document.getElementById('settingsLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.openSettings();
        });

        document.getElementById('helpLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.openHelp();
        });
    }

    async analyzeCurrentPage() {
        if (!this.currentTab) {
            this.showError('No active tab found');
            return;
        }

        const analyzeBtn = document.getElementById('analyzeBtn');
        const originalText = analyzeBtn.textContent;
        
        try {
            analyzeBtn.innerHTML = '<span class="loading"></span>Analyzing...';
            analyzeBtn.disabled = true;

            console.log('[Brdy Orbit] Analyzing tab:', this.currentTab.url);

            // Check if the current page is supported
            if (!this.isSupportedUrl(this.currentTab.url)) {
                this.showError('Page not supported for automation');
                return;
            }

            // Try to inject content script if needed
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: this.currentTab.id },
                    files: ['content_script.js']
                });
            } catch (injectionError) {
                console.log('[Brdy Orbit] Content script already injected or injection failed:', injectionError);
            }

            // Get page context from content script
            const response = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(this.currentTab.id, {
                    action: 'get_context'
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });

            if (response && response.success) {
                this.pageContext = response.data;
                this.updatePageInfo();
                this.showSuccess('Page analyzed successfully');
            } else {
                this.showError('Failed to analyze page: ' + (response?.error || 'Unknown error'));
            }

        } catch (error) {
            console.error('Analysis failed:', error);
            this.showError('Analysis failed: ' + error.message);
        } finally {
            analyzeBtn.textContent = originalText;
            analyzeBtn.disabled = false;
        }
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

    updatePageInfo() {
        const pageInfoEl = document.getElementById('pageInfo');
        const pageTitleEl = document.getElementById('pageTitle');
        const pageUrlEl = document.getElementById('pageUrl');
        const capabilitiesEl = document.getElementById('capabilities');

        pageInfoEl.style.display = 'block';
        pageTitleEl.textContent = this.pageContext.title || 'Unknown';
        
        const shortUrl = this.pageContext.url.length > 40 
            ? this.pageContext.url.substring(0, 40) + '...'
            : this.pageContext.url;
        pageUrlEl.textContent = shortUrl;

        // Show capabilities
        if (this.pageContext.isGoogleSheets && this.pageContext.googleSheets) {
            capabilitiesEl.style.display = 'block';
            const capsContainer = capabilitiesEl.querySelector('div:last-child') || capabilitiesEl;
            
            // Clear existing capability tags
            const existingTags = capsContainer.querySelectorAll('.capability-tag');
            existingTags.forEach(tag => tag.remove());

            // Add new capability tags
            if (this.pageContext.googleSheets.capabilities) {
                this.pageContext.googleSheets.capabilities.forEach(cap => {
                    const tag = document.createElement('span');
                    tag.className = 'capability-tag';
                    tag.textContent = cap.replace(/_/g, ' ');
                    capsContainer.appendChild(tag);
                });
            }

            // Enable Google Sheets button
            document.getElementById('fillSheetsBtn').disabled = false;
        } else if (this.pageContext.forms && this.pageContext.forms.length > 0) {
            capabilitiesEl.style.display = 'block';
            const capsContainer = capabilitiesEl.querySelector('div:last-child') || capabilitiesEl;
            
            // Clear existing tags
            const existingTags = capsContainer.querySelectorAll('.capability-tag');
            existingTags.forEach(tag => tag.remove());

            // Add form capabilities
            const tag = document.createElement('span');
            tag.className = 'capability-tag';
            tag.textContent = `${this.pageContext.forms.length} form(s) detected`;
            capsContainer.appendChild(tag);

            // Enable forms button
            document.getElementById('fillFormsBtn').disabled = false;
        } else {
            capabilitiesEl.style.display = 'none';
            document.getElementById('fillSheetsBtn').disabled = true;
            document.getElementById('fillFormsBtn').disabled = true;
        }
    }

    async fillGoogleSheets() {
        if (!this.pageContext || !this.pageContext.isGoogleSheets) {
            this.showError('Current page is not Google Sheets');
            return;
        }

        const btn = document.getElementById('fillSheetsBtn');
        const originalText = btn.textContent;

        try {
            btn.innerHTML = '<span class="loading"></span>Filling...';
            btn.disabled = true;

            // Generate sample data
            const sampleData = [
                ['Name', 'Email', 'Phone', 'Department'],
                ['John Smith', 'john@example.com', '(555) 123-4567', 'Sales'],
                ['Jane Doe', 'jane@example.com', '(555) 234-5678', 'Marketing'],
                ['Mike Johnson', 'mike@example.com', '(555) 345-6789', 'Engineering']
            ];

            const response = await chrome.tabs.sendMessage(this.currentTab.id, {
                action: 'fill_google_sheets',
                data: { rows: sampleData }
            });

            if (response && response.success) {
                this.showSuccess('Google Sheets filled successfully!');
            } else {
                this.showError('Failed to fill Google Sheets');
            }

        } catch (error) {
            console.error('Fill sheets failed:', error);
            this.showError('Fill failed: ' + error.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    async fillFormFields() {
        if (!this.pageContext || !this.pageContext.forms || this.pageContext.forms.length === 0) {
            this.showError('No forms detected on current page');
            return;
        }

        const btn = document.getElementById('fillFormsBtn');
        const originalText = btn.textContent;

        try {
            btn.innerHTML = '<span class="loading"></span>Filling...';
            btn.disabled = true;

            // Generate field mappings based on detected fields
            const fieldMappings = [
                { labelHint: 'name', value: 'John Smith' },
                { labelHint: 'email', value: 'john@example.com' },
                { labelHint: 'phone', value: '(555) 123-4567' },
                { labelHint: 'company', value: 'Acme Corporation' }
            ];

            const response = await chrome.tabs.sendMessage(this.currentTab.id, {
                action: 'fill_fields',
                pairs: fieldMappings
            });

            if (response && response.success) {
                const result = response.data;
                this.showSuccess(`Filled ${result.filled} fields successfully!`);
            } else {
                this.showError('Failed to fill form fields');
            }

        } catch (error) {
            console.error('Fill forms failed:', error);
            this.showError('Fill failed: ' + error.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    showSuccess(message) {
        // Simple success indication (could be enhanced with a toast)
        const statusEl = document.getElementById('status');
        const originalContent = statusEl.innerHTML;
        const originalClass = statusEl.className;
        
        statusEl.className = 'status connected';
        statusEl.innerHTML = '✅ ' + message;
        
        setTimeout(() => {
            statusEl.className = originalClass;
            statusEl.innerHTML = originalContent;
        }, 3000);
    }

    showError(message) {
        // Simple error indication (could be enhanced with a toast)
        const statusEl = document.getElementById('status');
        const originalContent = statusEl.innerHTML;
        const originalClass = statusEl.className;
        
        statusEl.className = 'status disconnected';
        statusEl.innerHTML = '❌ ' + message;
        
        setTimeout(() => {
            statusEl.className = originalClass;
            statusEl.innerHTML = originalContent;
        }, 3000);
    }

    openSettings() {
        chrome.runtime.openOptionsPage();
    }

    openHelp() {
        chrome.tabs.create({
            url: 'https://docs.anthropic.com/en/docs/claude-code'
        });
    }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new BrdyOrbitPopup();
});