/**
 * Brdy Pilot DOM Interaction System
 * Provides DOM manipulation capabilities for automation within Orbit
 */

const { shell } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const GoogleSheetsInteraction = require('./googleSheetsInteraction');

class DOMInteraction {
    constructor() {
        this.injectedScripts = new Map();
        this.domObservers = new Map();
        this.automationQueue = [];
        this.isProcessing = false;
        this.googleSheetsInteraction = new GoogleSheetsInteraction();
    }

    /**
     * Inject automation script into a web page
     */
    async injectAutomationScript(webContents, options = {}) {
        try {
            const scriptPath = path.join(__dirname, 'scripts', 'domAutomation.js');
            const script = await this.loadAutomationScript();
            
            await webContents.executeJavaScript(script);
            
            // Set up communication channel
            // Also inject Google Sheets automation if applicable
            const googleSheetsScript = this.googleSheetsInteraction.getCompleteScript();
            await webContents.executeJavaScript(googleSheetsScript);

            await webContents.executeJavaScript(`
                window.brdyPilot = {
                    ready: true,
                    version: '1.0.0',
                    options: ${JSON.stringify(options)},
                    googleSheets: window.GoogleSheetsAutomation || null
                };
                
                // Notify Orbit that Brdy Pilot is ready
                console.log('[Brdy Pilot] DOM automation script injected successfully');
                if (window.GoogleSheetsAutomation) {
                    console.log('[Brdy Pilot] Google Sheets automation available');
                }
            `);

            this.injectedScripts.set(webContents.id, {
                injected: true,
                timestamp: Date.now(),
                options
            });

            return { success: true, contentId: webContents.id };
            
        } catch (error) {
            console.error('[DOMInteraction] Failed to inject script:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Load the DOM automation script
     */
    async loadAutomationScript() {
        // Return the inline automation script
        return `
(function() {
    'use strict';
    
    // Brdy Pilot DOM Automation Script
    window.BrdyPilotDOM = {
        version: '1.0.0',
        
        // Detect application type
        detectApp: function() {
            const url = window.location.href.toLowerCase();
            const title = document.title.toLowerCase();
            const bodyContent = document.body?.textContent?.toLowerCase() || '';
            
            // Salesforce detection
            if (url.includes('salesforce.com') || url.includes('.lightning.force.com') || 
                title.includes('salesforce') || bodyContent.includes('salesforce')) {
                return {
                    type: 'salesforce',
                    platform: 'crm',
                    capabilities: ['contact_management', 'lead_management', 'opportunity_management', 'form_filling'],
                    confidence: 0.95,
                    crm: true
                };
            }
            
            // HubSpot detection
            if (url.includes('hubspot.com') || url.includes('.hubspot.') || 
                title.includes('hubspot') || bodyContent.includes('hubspot')) {
                return {
                    type: 'hubspot',
                    platform: 'crm',
                    capabilities: ['contact_management', 'lead_management', 'deal_management', 'form_filling'],
                    confidence: 0.95,
                    crm: true
                };
            }
            
            // Generic CRM detection
            if (bodyContent.includes('crm') || bodyContent.includes('customer relationship') ||
                url.includes('crm') || title.includes('crm')) {
                return {
                    type: 'crm',
                    platform: 'crm',
                    capabilities: ['contact_management', 'lead_management', 'form_filling'],
                    confidence: 0.8,
                    crm: true
                };
            }
            
            // Gmail detection
            if (url.includes('mail.google.com') || title.includes('gmail')) {
                return {
                    type: 'gmail',
                    capabilities: ['email_compose', 'email_read', 'contact_management'],
                    confidence: 0.95
                };
            }
            
            // Outlook detection
            if (url.includes('outlook.') || title.includes('outlook')) {
                return {
                    type: 'outlook', 
                    capabilities: ['email_compose', 'email_read', 'calendar_management'],
                    confidence: 0.95
                };
            }
            
            // Form detection
            const forms = document.querySelectorAll('form');
            if (forms.length > 0) {
                // Check if it looks like a CRM form
                const formText = Array.from(forms).map(form => form.textContent?.toLowerCase() || '').join(' ');
                const isCrmForm = formText.includes('lead') || formText.includes('contact') || 
                                 formText.includes('opportunity') || formText.includes('deal') ||
                                 formText.includes('account') || formText.includes('customer');
                
                return {
                    type: isCrmForm ? 'crm_form' : 'form_application',
                    platform: isCrmForm ? 'crm' : 'generic',
                    capabilities: ['form_filling', 'data_entry'],
                    confidence: 0.8,
                    forms: forms.length,
                    crm: isCrmForm
                };
            }
            
            return {
                type: 'web_application',
                capabilities: ['text_extraction'],
                confidence: 0.6
            };
        },
        
        // Map form fields
        mapFields: function() {
            const fields = [];
            const inputs = document.querySelectorAll('input, textarea, select');
            
            inputs.forEach((element, index) => {
                const field = {
                    id: element.id || \`field_\${index}\`,
                    name: element.name || '',
                    type: element.type || 'text',
                    placeholder: element.placeholder || '',
                    required: element.required || false,
                    value: element.value || '',
                    semantic: this.inferSemantic(element),
                    selector: this.generateSelector(element),
                    rect: element.getBoundingClientRect(),
                    visible: element.offsetParent !== null
                };
                fields.push(field);
            });
            
            return {
                fields: fields,
                totalCount: fields.length,
                visibleCount: fields.filter(f => f.visible).length
            };
        },
        
        // Infer semantic meaning of form fields
        inferSemantic: function(element) {
            const combined = \`\${element.name || ''} \${element.id || ''} \${element.placeholder || ''}\`.toLowerCase();
            const label = this.getFieldLabel(element);
            const context = \`\${combined} \${label}\`.toLowerCase();
            
            // Basic contact fields
            if (context.includes('email') || element.type === 'email') return 'email';
            if (context.includes('name') || context.includes('first') || context.includes('last')) return 'name';
            if (context.includes('phone') || context.includes('tel') || element.type === 'tel') return 'phone';
            if (context.includes('address') || context.includes('street') || context.includes('city')) return 'address';
            if (context.includes('company') || context.includes('organization')) return 'company';
            if (context.includes('subject') || context.includes('title')) return 'subject';
            if (context.includes('message') || context.includes('comment')) return 'message';
            
            // CRM-specific fields
            if (context.includes('lead source') || context.includes('source')) return 'lead_source';
            if (context.includes('lead status') || context.includes('status')) return 'lead_status';
            if (context.includes('deal amount') || context.includes('amount') || context.includes('value')) return 'deal_amount';
            if (context.includes('pipeline') || context.includes('stage')) return 'pipeline_stage';
            if (context.includes('owner') || context.includes('assigned')) return 'account_owner';
            if (context.includes('industry') || context.includes('sector')) return 'industry';
            if (context.includes('size') || context.includes('employees')) return 'company_size';
            if (context.includes('website') || context.includes('url')) return 'website';
            if (context.includes('revenue') || context.includes('annual')) return 'annual_revenue';
            if (context.includes('priority') || context.includes('importance')) return 'priority';
            if (context.includes('campaign') || context.includes('utm')) return 'campaign';
            if (context.includes('description') || context.includes('notes')) return 'description';
            
            return 'unknown';
        },
        
        // Get field label text
        getFieldLabel: function(element) {
            // Look for associated label
            const labelId = element.getAttribute('aria-labelledby');
            if (labelId) {
                const label = document.getElementById(labelId);
                if (label) return label.textContent || '';
            }
            
            // Look for label with for attribute
            if (element.id) {
                const label = document.querySelector(\`label[for="\${element.id}"]\`);
                if (label) return label.textContent || '';
            }
            
            // Look for parent label
            const parentLabel = element.closest('label');
            if (parentLabel) return parentLabel.textContent || '';
            
            // Look for sibling label
            const siblingLabel = element.parentElement?.querySelector('label');
            if (siblingLabel) return siblingLabel.textContent || '';
            
            return '';
        },
        
        // Generate CSS selector for element
        generateSelector: function(element) {
            if (element.id) return \`#\${element.id}\`;
            if (element.name) return \`[name="\${element.name}"]\`;
            
            // Generate path-based selector
            const path = [];
            let current = element;
            
            while (current && current.nodeType === 1) {
                let selector = current.tagName.toLowerCase();
                
                if (current.className) {
                    selector += '.' + current.className.split(' ').join('.');
                }
                
                path.unshift(selector);
                current = current.parentElement;
                
                if (path.length > 4) break; // Limit depth
            }
            
            return path.join(' > ');
        },
        
        // Fill form fields
        fillFields: function(mappings, options = {}) {
            const results = {
                filled: 0,
                failed: 0,
                errors: []
            };
            
            Object.entries(mappings).forEach(([selector, value]) => {
                try {
                    const element = document.querySelector(selector);
                    if (element) {
                        // Set value
                        element.value = value;
                        
                        // Trigger events
                        element.dispatchEvent(new Event('input', { bubbles: true }));
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                        element.dispatchEvent(new Event('blur', { bubbles: true }));
                        
                        // Visual feedback
                        if (options.showFeedback) {
                            element.style.outline = '2px solid #4ade80';
                            setTimeout(() => {
                                element.style.outline = '';
                            }, 2000);
                        }
                        
                        results.filled++;
                    } else {
                        results.failed++;
                        results.errors.push(\`Element not found: \${selector}\`);
                    }
                } catch (error) {
                    results.failed++;
                    results.errors.push(\`Error filling \${selector}: \${error.message}\`);
                }
            });
            
            return results;
        },
        
        // Extract text content
        extractText: function(options = {}) {
            const result = {
                title: document.title,
                url: window.location.href,
                headings: [],
                paragraphs: [],
                links: [],
                forms: [],
                buttons: []
            };
            
            // Extract headings
            document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
                result.headings.push({
                    level: el.tagName.toLowerCase(),
                    text: el.textContent.trim()
                });
            });
            
            // Extract paragraphs
            document.querySelectorAll('p').forEach(el => {
                const text = el.textContent.trim();
                if (text.length > 10) {
                    result.paragraphs.push(text);
                }
            });
            
            // Extract links
            document.querySelectorAll('a[href]').forEach(el => {
                result.links.push({
                    text: el.textContent.trim(),
                    href: el.href
                });
            });
            
            // Extract form information
            document.querySelectorAll('form').forEach((form, index) => {
                result.forms.push({
                    index: index,
                    action: form.action,
                    method: form.method,
                    fieldCount: form.elements.length
                });
            });
            
            // Extract buttons
            document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach(el => {
                result.buttons.push({
                    text: el.textContent || el.value,
                    type: el.type
                });
            });
            
            return result;
        },
        
        // Email composition helpers
        emailCompose: {
            // Find email compose areas
            findComposeArea: function() {
                // Gmail selectors
                const gmailSelectors = [
                    '[contenteditable="true"][aria-label*="compose"]',
                    '[contenteditable="true"][aria-label*="message"]',
                    '.Am.Al.editable'
                ];
                
                // Outlook selectors
                const outlookSelectors = [
                    '[contenteditable="true"][role="textbox"]',
                    '.ms-rte-content[contenteditable="true"]'
                ];
                
                // Try Gmail first
                for (const selector of gmailSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        return { element, type: 'gmail', selector };
                    }
                }
                
                // Try Outlook
                for (const selector of outlookSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        return { element, type: 'outlook', selector };
                    }
                }
                
                return null;
            },
            
            // Insert content into compose area
            insertContent: function(content, position = 'append') {
                const composeArea = this.findComposeArea();
                if (!composeArea) {
                    return { success: false, error: 'No compose area found' };
                }
                
                const { element } = composeArea;
                
                try {
                    if (position === 'append') {
                        element.innerHTML += content;
                    } else if (position === 'prepend') {
                        element.innerHTML = content + element.innerHTML;
                    } else if (position === 'replace') {
                        element.innerHTML = content;
                    }
                    
                    // Trigger input event
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    return { 
                        success: true, 
                        type: composeArea.type,
                        length: content.length 
                    };
                    
                } catch (error) {
                    return { 
                        success: false, 
                        error: error.message 
                    };
                }
            }
        },
        
        // Utility functions
        utils: {
            // Highlight elements
            highlightElement: function(selector, duration = 3000) {
                const element = document.querySelector(selector);
                if (element) {
                    const originalOutline = element.style.outline;
                    element.style.outline = '3px solid #3b82f6';
                    element.style.outlineOffset = '2px';
                    
                    setTimeout(() => {
                        element.style.outline = originalOutline;
                        element.style.outlineOffset = '';
                    }, duration);
                    
                    return true;
                }
                return false;
            },
            
            // Scroll element into view
            scrollToElement: function(selector) {
                const element = document.querySelector(selector);
                if (element) {
                    element.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'center' 
                    });
                    return true;
                }
                return false;
            },
            
            // Wait for element to appear
            waitForElement: function(selector, timeout = 5000) {
                return new Promise((resolve) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        resolve(element);
                        return;
                    }
                    
                    const observer = new MutationObserver(() => {
                        const element = document.querySelector(selector);
                        if (element) {
                            observer.disconnect();
                            resolve(element);
                        }
                    });
                    
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                    
                    setTimeout(() => {
                        observer.disconnect();
                        resolve(null);
                    }, timeout);
                });
            }
        }
    };
    
    // Make it globally available
    window.brdyPilot = window.BrdyPilotDOM;
    
    console.log('[Brdy Pilot] DOM automation ready');
})();
        `;
    }

    /**
     * Execute DOM automation command
     */
    async executeCommand(webContents, command, data = {}) {
        try {
            if (!this.injectedScripts.has(webContents.id)) {
                await this.injectAutomationScript(webContents);
            }

            const script = this.generateCommandScript(command, data);
            const result = await webContents.executeJavaScript(script);
            
            return {
                success: true,
                command,
                result,
                timestamp: Date.now()
            };
            
        } catch (error) {
            console.error(`[DOMInteraction] Command '${command}' failed:`, error);
            return {
                success: false,
                command,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Generate JavaScript for specific commands
     */
    generateCommandScript(command, data) {
        switch (command) {
            case 'detectApp':
                return 'window.brdyPilot.detectApp()';
                
            case 'mapFields':
                return 'window.brdyPilot.mapFields()';
                
            case 'fillFields':
                return `window.brdyPilot.fillFields(${JSON.stringify(data.mappings)}, ${JSON.stringify(data.options || {})})`;
                
            case 'extractText':
                return `window.brdyPilot.extractText(${JSON.stringify(data.options || {})})`;
                
            case 'emailInsert':
                return `window.brdyPilot.emailCompose.insertContent(${JSON.stringify(data.content)}, ${JSON.stringify(data.position || 'append')})`;
                
            case 'highlightElement':
                return `window.brdyPilot.utils.highlightElement(${JSON.stringify(data.selector)}, ${data.duration || 3000})`;
                
            case 'scrollToElement':
                return `window.brdyPilot.utils.scrollToElement(${JSON.stringify(data.selector)})`;
                
            // Google Sheets specific commands
            case 'detectGoogleSheets':
                return 'window.brdyPilot.googleSheets ? window.brdyPilot.googleSheets.detectGoogleSheets() : { isGoogleSheets: false, error: "Google Sheets automation not available" }';
                
            case 'addMockDataToGoogleSheets':
                return `window.brdyPilot.googleSheets ? window.brdyPilot.googleSheets.addMockDataToSheet(${JSON.stringify(data.dataType || 'people')}, ${data.rowCount || 10}, ${data.startRow || 1}, ${data.startCol || 1}) : { success: false, error: "Google Sheets automation not available" }`;
                
            case 'insertGoogleSheetsData':
                return `window.brdyPilot.googleSheets ? window.brdyPilot.googleSheets.insertBulkData(${JSON.stringify(data.dataMatrix)}, ${data.startRow || 1}, ${data.startCol || 1}) : { success: false, error: "Google Sheets automation not available" }`;
                
            case 'selectGoogleSheetsCell':
                return `window.brdyPilot.googleSheets ? window.brdyPilot.googleSheets.findAndSelectCell(${data.row || 1}, ${data.col || 1}) : { success: false, error: "Google Sheets automation not available" }`;
                
            default:
                throw new Error(`Unknown command: ${command}`);
        }
    }

    /**
     * Queue automation tasks
     */
    queueAutomation(task) {
        this.automationQueue.push({
            ...task,
            id: Date.now() + Math.random(),
            queued: Date.now()
        });
        
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    /**
     * Process automation queue
     */
    async processQueue() {
        this.isProcessing = true;
        
        while (this.automationQueue.length > 0) {
            const task = this.automationQueue.shift();
            
            try {
                console.log(`[DOMInteraction] Processing task: ${task.command}`);
                const result = await this.executeCommand(task.webContents, task.command, task.data);
                
                if (task.callback) {
                    task.callback(result);
                }
                
                // Small delay between tasks
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error('[DOMInteraction] Task processing error:', error);
                
                if (task.callback) {
                    task.callback({
                        success: false,
                        error: error.message
                    });
                }
            }
        }
        
        this.isProcessing = false;
    }

    /**
     * Open URL in external browser for automation
     */
    async openExternalBrowser(url) {
        try {
            await shell.openExternal(url);
            return { success: true, url };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Get automation statistics
     */
    getStatistics() {
        return {
            injectedScripts: this.injectedScripts.size,
            queuedTasks: this.automationQueue.length,
            isProcessing: this.isProcessing,
            observers: this.domObservers.size
        };
    }

    /**
     * Add mock data to Google Sheets (convenience method)
     */
    async addMockDataToGoogleSheets(webContents, options = {}) {
        const {
            dataType = 'people',
            rowCount = 10,
            startRow = 1,
            startCol = 1
        } = options;

        try {
            // First detect if it's Google Sheets
            const detection = await this.executeCommand(webContents, 'detectGoogleSheets');
            
            if (!detection.success || !detection.result.isGoogleSheets) {
                return {
                    success: false,
                    error: 'Current page is not Google Sheets',
                    detection: detection.result
                };
            }

            console.log('[DOMInteraction] Google Sheets detected, adding mock data...');

            // Add the mock data
            const result = await this.executeCommand(webContents, 'addMockDataToGoogleSheets', {
                dataType,
                rowCount,
                startRow,
                startCol
            });

            return {
                success: result.success,
                data: result.result,
                detection: detection.result,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error('[DOMInteraction] Error adding mock data to Google Sheets:', error);
            return {
                success: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Clean up resources
     */
    cleanup() {
        this.injectedScripts.clear();
        this.domObservers.clear();
        this.automationQueue = [];
        this.isProcessing = false;
    }
}

const domInteraction = new DOMInteraction();

module.exports = domInteraction;