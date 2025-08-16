/**
 * Brdy Orbit Chrome Extension - Content Script
 * Handles DOM reading and field filling for automation
 */

class BrdyOrbitContentScript {
    constructor() {
        this.isGoogleSheets = this.detectGoogleSheets();
        this.allowedDomains = [];
        this.setupMessageListener();
        this.injectPageScript();
        this.connectToOrbitApp();
    }

    /**
     * Detect if current page is Google Sheets
     */
    detectGoogleSheets() {
        const url = window.location.href.toLowerCase();
        return url.includes('docs.google.com/spreadsheets') || 
               url.includes('sheets.google.com') ||
               document.querySelector('[data-sheets-root]') !== null ||
               document.querySelector('[role="grid"]') !== null;
    }

    /**
     * Setup message listener for commands from service worker
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async response
        });
    }

    /**
     * Inject page script for deeper DOM access
     */
    injectPageScript() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injected_script.js');
        script.onload = function() {
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    }

    /**
     * Handle messages from service worker
     */
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'get_context':
                    const context = await this.getPageContext();
                    sendResponse({ success: true, data: context });
                    break;

                case 'fill_google_sheets':
                    const fillResult = await this.fillGoogleSheets(message.data);
                    sendResponse({ success: fillResult.success, data: fillResult });
                    break;

                case 'fill_fields':
                    const fieldResult = await this.fillFormFields(message.pairs);
                    sendResponse({ success: true, data: fieldResult });
                    break;

                case 'copy_to_clipboard':
                    await this.copyToClipboard(message.text);
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('[Brdy Orbit] Content script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * Get page context for analysis
     */
    async getPageContext() {
        const context = {
            url: window.location.href,
            title: document.title,
            selectionText: window.getSelection().toString(),
            isGoogleSheets: this.isGoogleSheets,
            timestamp: Date.now()
        };

        // Get DOM structure for analysis
        if (this.isGoogleSheets) {
            context.googleSheets = await this.analyzeGoogleSheets();
        } else {
            context.forms = this.analyzeForms();
        }

        // Get visible text sample
        context.domTextSlice = this.getVisibleTextSample();

        return context;
    }

    /**
     * Analyze Google Sheets structure
     */
    async analyzeGoogleSheets() {
        return new Promise((resolve) => {
            // Send message to injected script for deeper analysis
            window.postMessage({
                type: 'BRDY_ANALYZE_SHEETS',
                source: 'content_script'
            }, '*');

            // Listen for response
            const messageHandler = (event) => {
                if (event.data.type === 'BRDY_SHEETS_ANALYSIS') {
                    window.removeEventListener('message', messageHandler);
                    resolve(event.data.analysis);
                }
            };
            window.addEventListener('message', messageHandler);

            // Fallback timeout
            setTimeout(() => {
                window.removeEventListener('message', messageHandler);
                resolve({
                    hasGrid: !!document.querySelector('[role="grid"]'),
                    hasFormulaBar: !!document.querySelector('[aria-label*="formula"]'),
                    isEditable: !document.querySelector('.docs-homescreen')
                });
            }, 1000);
        });
    }

    /**
     * Analyze forms on the page
     */
    analyzeForms() {
        const forms = [];
        document.querySelectorAll('form').forEach((form, index) => {
            const fields = [];
            form.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach((field) => {
                fields.push({
                    id: field.id || `field_${index}`,
                    name: field.name || '',
                    type: field.type || field.tagName.toLowerCase(),
                    placeholder: field.placeholder || '',
                    label: this.getFieldLabel(field),
                    required: field.required,
                    value: field.value,
                    semantic: this.inferFieldSemantic(field)
                });
            });

            forms.push({
                index,
                action: form.action,
                method: form.method,
                fields
            });
        });

        return forms;
    }

    /**
     * Get field label
     */
    getFieldLabel(field) {
        // Try various methods to find the label
        const labelId = field.getAttribute('aria-labelledby');
        if (labelId) {
            const label = document.getElementById(labelId);
            if (label) return label.textContent.trim();
        }

        if (field.id) {
            const label = document.querySelector(`label[for="${field.id}"]`);
            if (label) return label.textContent.trim();
        }

        const parentLabel = field.closest('label');
        if (parentLabel) return parentLabel.textContent.trim();

        return '';
    }

    /**
     * Infer field semantic meaning
     */
    inferFieldSemantic(field) {
        const context = `${field.name || ''} ${field.id || ''} ${field.placeholder || ''} ${this.getFieldLabel(field)}`.toLowerCase();

        if (context.includes('email') || field.type === 'email') return 'email';
        if (context.includes('phone') || field.type === 'tel') return 'phone';
        if (context.includes('name')) return 'name';
        if (context.includes('company')) return 'company';
        if (context.includes('address')) return 'address';
        if (context.includes('subject')) return 'subject';
        if (context.includes('message')) return 'message';

        return 'unknown';
    }

    /**
     * Get sample of visible text
     */
    getVisibleTextSample() {
        const textNodes = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    const parent = node.parentElement;
                    if (!parent || parent.offsetParent === null) return NodeFilter.FILTER_REJECT;
                    if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent.trim();
            if (text.length > 10) {
                textNodes.push(text);
                if (textNodes.length >= 10) break;
            }
        }

        return textNodes.join(' ').substring(0, 500);
    }

    /**
     * Fill Google Sheets with data
     */
    async fillGoogleSheets(data) {
        if (!this.isGoogleSheets) {
            return { success: false, error: 'Not a Google Sheets page' };
        }

        return new Promise((resolve) => {
            // Send message to injected script
            window.postMessage({
                type: 'BRDY_FILL_SHEETS',
                source: 'content_script',
                data: data
            }, '*');

            // Listen for response
            const messageHandler = (event) => {
                if (event.data.type === 'BRDY_FILL_RESULT') {
                    window.removeEventListener('message', messageHandler);
                    resolve(event.data.result);
                }
            };
            window.addEventListener('message', messageHandler);

            // Fallback timeout
            setTimeout(() => {
                window.removeEventListener('message', messageHandler);
                resolve({ success: false, error: 'Timeout waiting for fill operation' });
            }, 10000);
        });
    }

    /**
     * Fill form fields
     */
    async fillFormFields(pairs) {
        const results = {
            filled: 0,
            missed: 0,
            errors: []
        };

        for (const pair of pairs) {
            try {
                const element = this.findElement(pair.labelHint);
                if (element) {
                    await this.fillField(element, pair.value);
                    results.filled++;
                } else {
                    results.missed++;
                    results.errors.push(`Element not found: ${pair.labelHint}`);
                }
            } catch (error) {
                results.missed++;
                results.errors.push(`Error filling ${pair.labelHint}: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * Find element by label hint
     */
    findElement(labelHint) {
        // Try multiple strategies to find the element
        const strategies = [
            () => document.querySelector(`[aria-label*="${labelHint}" i]`),
            () => document.querySelector(`[placeholder*="${labelHint}" i]`),
            () => document.querySelector(`[name*="${labelHint}" i]`),
            () => document.querySelector(`[id*="${labelHint}" i]`),
            () => {
                const labels = document.querySelectorAll('label');
                for (const label of labels) {
                    if (label.textContent.toLowerCase().includes(labelHint.toLowerCase())) {
                        return label.querySelector('input, textarea, select') ||
                               document.querySelector(`[id="${label.getAttribute('for')}"]`);
                    }
                }
                return null;
            }
        ];

        for (const strategy of strategies) {
            const element = strategy();
            if (element) return element;
        }

        return null;
    }

    /**
     * Fill individual field
     */
    async fillField(element, value) {
        // Focus the element
        element.focus();

        // Clear existing value
        element.value = '';

        // Set new value
        element.value = value;

        // Trigger events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));

        // Handle React/Vue components
        if (element._valueTracker) {
            element._valueTracker.setValue('');
        }

        // Visual feedback
        element.style.outline = '2px solid #4ade80';
        setTimeout(() => {
            element.style.outline = '';
        }, 1000);
    }

    /**
     * Copy text to clipboard
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            // Fallback method
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        }
    }
}

// Initialize content script
const brdyOrbitContentScript = new BrdyOrbitContentScript();

// Notify service worker that content script is ready
chrome.runtime.sendMessage({ action: 'content_script_ready', url: window.location.href }, (response) => {
    if (chrome.runtime.lastError) {
        console.error('[Brdy Orbit] Error sending ready message:', chrome.runtime.lastError.message);
    } else {
        console.log('[Brdy Orbit] Content script ready on:', window.location.href);
    }
});

// Add global debug info
window.brdyOrbitExtension = {
    version: '1.0.0',
    ready: true,
    isGoogleSheets: brdyOrbitContentScript.isGoogleSheets,
    lastUpdate: Date.now()
};

console.log('[Brdy Orbit] Content script loaded:', window.brdyOrbitExtension);

// Add connection methods to the class prototype
BrdyOrbitContentScript.prototype.connectToOrbitApp = function() {
    this.pollForRequests();
};

BrdyOrbitContentScript.prototype.pollForRequests = async function() {
    const orbitPorts = [55556, 55555, 55557];
    
    for (const port of orbitPorts) {
        try {
            const response = await fetch(`http://localhost:${port}/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                console.log(`[Brdy Orbit] Connected to app on port ${port}`);
                this.orbitPort = port;
                return;
            }
        } catch (error) {
            // Continue to next port
        }
    }
    
    console.log('[Brdy Orbit] Could not connect to Orbit app - using fallback mode');
};

BrdyOrbitContentScript.prototype.getActiveTabInfo = function() {
    return [{
        id: 1,
        url: window.location.href,
        title: document.title,
        hasContentScript: true,
        isGoogleSheets: this.isGoogleSheets
    }];
};