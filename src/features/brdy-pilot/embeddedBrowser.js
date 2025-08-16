/**
 * Embedded Browser for Brdy Orbit
 * Provides full browser automation capabilities like GPT agents
 */

const { BrowserView, BrowserWindow } = require('electron');
const path = require('path');

class EmbeddedBrowser {
    constructor() {
        this.browserView = null;
        this.parentWindow = null;
        this.automationScripts = new Map();
        this.isReady = false;
    }

    /**
     * Create embedded browser window
     */
    async createBrowserWindow(options = {}) {
        try {
            // Create a new window for the embedded browser
            this.parentWindow = new BrowserWindow({
                width: options.width || 1200,
                height: options.height || 800,
                title: 'Brdy Orbit Browser',
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: false,
                    webSecurity: false, // Allows automation
                    allowRunningInsecureContent: true
                },
                show: true
            });

            // Create browser view
            this.browserView = new BrowserView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: false,
                    webSecurity: false, // Critical for automation
                    allowRunningInsecureContent: true
                }
            });

            // Attach browser view to window
            this.parentWindow.setBrowserView(this.browserView);
            
            // Set browser view bounds
            const bounds = this.parentWindow.getBounds();
            this.browserView.setBounds({ 
                x: 0, 
                y: 0, 
                width: bounds.width, 
                height: bounds.height 
            });

            // Handle window resize
            this.parentWindow.on('resize', () => {
                const bounds = this.parentWindow.getBounds();
                this.browserView.setBounds({ 
                    x: 0, 
                    y: 0, 
                    width: bounds.width, 
                    height: bounds.height 
                });
            });

            // Inject automation capabilities when page loads
            this.browserView.webContents.on('dom-ready', () => {
                this.injectAutomationScripts();
                this.injectGoogleSheetsAutomation();
            });

            // Setup navigation events
            this.setupNavigationEvents();

            this.isReady = true;
            console.log('[EmbeddedBrowser] Browser window created successfully');

            return {
                success: true,
                window: this.parentWindow,
                browserView: this.browserView
            };

        } catch (error) {
            console.error('[EmbeddedBrowser] Failed to create browser:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Navigate to URL with full automation support
     */
    async navigateToUrl(url) {
        // Check if browser needs to be created or recreated
        if (!this.browserView || !this.browserView.webContents || this.browserView.webContents.isDestroyed()) {
            console.log('[EmbeddedBrowser] Browser view invalid, creating new browser window...');
            const createResult = await this.createBrowserWindow();
            if (!createResult.success) {
                throw new Error(`Failed to create browser window: ${createResult.error}`);
            }
        }

        // Verify webContents is available
        if (!this.browserView || !this.browserView.webContents) {
            throw new Error('Browser not initialized properly - webContents unavailable after creation attempt.');
        }

        try {
            console.log(`[EmbeddedBrowser] Navigating to: ${url}`);
            await this.browserView.webContents.loadURL(url);
            
            // Wait for page to be fully loaded
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Navigation timeout after 10 seconds'));
                }, 10000);

                this.browserView.webContents.once('dom-ready', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                this.browserView.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
                    clearTimeout(timeout);
                    reject(new Error(`Page load failed: ${errorDescription} (${errorCode})`));
                });
            });

            // Inject automation scripts
            await this.injectAutomationScripts();

            return { success: true, url: url };
        } catch (error) {
            console.error('[EmbeddedBrowser] Navigation failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Inject comprehensive automation scripts
     */
    async injectAutomationScripts() {
        if (!this.browserView) return;

        try {
            // Inject main automation framework
            await this.browserView.webContents.executeJavaScript(`
                // Brdy Orbit Full Browser Automation
                window.BrdyAutomation = {
                    version: '2.0.0',
                    capabilities: ['form_filling', 'clicking', 'typing', 'navigation', 'data_extraction'],
                    
                    // Detect current page/app
                    detectPage: function() {
                        const url = window.location.href.toLowerCase();
                        const title = document.title.toLowerCase();
                        const body = document.body?.textContent?.toLowerCase() || '';
                        
                        // Salesforce detection
                        if (url.includes('salesforce.com') || url.includes('lightning.force.com')) {
                            return {
                                platform: 'salesforce',
                                type: 'crm',
                                capabilities: ['contact_management', 'lead_management', 'opportunity_management'],
                                confidence: 0.95
                            };
                        }
                        
                        // HubSpot detection  
                        if (url.includes('hubspot.com') || url.includes('.hubspot.')) {
                            return {
                                platform: 'hubspot',
                                type: 'crm', 
                                capabilities: ['contact_management', 'lead_management', 'deal_management'],
                                confidence: 0.95
                            };
                        }
                        
                        // Google Sheets detection
                        if (url.includes('docs.google.com/spreadsheets') || url.includes('sheets.google.com')) {
                            return {
                                platform: 'google_sheets',
                                type: 'spreadsheet',
                                capabilities: ['data_entry', 'cell_manipulation', 'formula_insertion'],
                                confidence: 0.95
                            };
                        }
                        
                        // Generic form detection
                        const forms = document.querySelectorAll('form');
                        if (forms.length > 0) {
                            return {
                                platform: 'generic_form',
                                type: 'form',
                                capabilities: ['form_filling', 'data_entry'],
                                confidence: 0.8,
                                forms: forms.length
                            };
                        }
                        
                        return {
                            platform: 'unknown',
                            type: 'webpage',
                            capabilities: ['text_extraction', 'navigation'],
                            confidence: 0.6
                        };
                    },
                    
                    // Advanced form field detection
                    detectFormFields: function() {
                        const fields = [];
                        const selectors = 'input:not([type="hidden"]), textarea, select';
                        const elements = document.querySelectorAll(selectors);
                        
                        elements.forEach((element, index) => {
                            const field = {
                                id: element.id || \`field_\${index}\`,
                                name: element.name || '',
                                type: element.type || element.tagName.toLowerCase(),
                                placeholder: element.placeholder || '',
                                value: element.value || '',
                                required: element.required || false,
                                semantic: this.inferSemanticType(element),
                                selector: this.generateSelector(element),
                                rect: element.getBoundingClientRect(),
                                visible: this.isElementVisible(element),
                                label: this.getFieldLabel(element)
                            };
                            fields.push(field);
                        });
                        
                        return {
                            fields: fields,
                            totalCount: fields.length,
                            visibleCount: fields.filter(f => f.visible).length,
                            timestamp: Date.now()
                        };
                    },
                    
                    // Infer field semantic type with enhanced CRM detection
                    inferSemanticType: function(element) {
                        const name = (element.name || '').toLowerCase();
                        const id = (element.id || '').toLowerCase();
                        const placeholder = (element.placeholder || '').toLowerCase();
                        const label = this.getFieldLabel(element).toLowerCase();
                        const context = \`\${name} \${id} \${placeholder} \${label}\`;
                        
                        // Basic fields
                        if (context.includes('email') || element.type === 'email') return 'email';
                        if (context.includes('phone') || element.type === 'tel') return 'phone';
                        if (context.includes('first') && context.includes('name')) return 'first_name';
                        if (context.includes('last') && context.includes('name')) return 'last_name';
                        if (context.includes('name') && !context.includes('company')) return 'name';
                        if (context.includes('company') || context.includes('organization')) return 'company';
                        if (context.includes('address') || context.includes('street')) return 'address';
                        if (context.includes('city')) return 'city';
                        if (context.includes('state') || context.includes('province')) return 'state';
                        if (context.includes('zip') || context.includes('postal')) return 'zip_code';
                        if (context.includes('website') || context.includes('url')) return 'website';
                        
                        // CRM-specific fields
                        if (context.includes('lead') && context.includes('source')) return 'lead_source';
                        if (context.includes('lead') && context.includes('status')) return 'lead_status';
                        if (context.includes('deal') || context.includes('opportunity')) {
                            if (context.includes('amount') || context.includes('value')) return 'deal_amount';
                            if (context.includes('stage')) return 'pipeline_stage';
                            return 'deal_info';
                        }
                        if (context.includes('account') && context.includes('owner')) return 'account_owner';
                        if (context.includes('industry') || context.includes('sector')) return 'industry';
                        if (context.includes('revenue') || context.includes('annual')) return 'annual_revenue';
                        if (context.includes('employee') || context.includes('size')) return 'company_size';
                        if (context.includes('priority') || context.includes('importance')) return 'priority';
                        if (context.includes('campaign') || context.includes('utm')) return 'campaign';
                        if (context.includes('source')) return 'source';
                        if (context.includes('status') && !context.includes('lead')) return 'status';
                        if (context.includes('note') || context.includes('comment') || context.includes('description')) return 'notes';
                        
                        return 'unknown';
                    },
                    
                    // Get field label
                    getFieldLabel: function(element) {
                        // Try aria-labelledby
                        const labelId = element.getAttribute('aria-labelledby');
                        if (labelId) {
                            const labelEl = document.getElementById(labelId);
                            if (labelEl) return labelEl.textContent.trim();
                        }
                        
                        // Try label[for]
                        if (element.id) {
                            const labelEl = document.querySelector(\`label[for="\${element.id}"]\`);
                            if (labelEl) return labelEl.textContent.trim();
                        }
                        
                        // Try parent label
                        const parentLabel = element.closest('label');
                        if (parentLabel) return parentLabel.textContent.trim();
                        
                        // Try previous sibling
                        let sibling = element.previousElementSibling;
                        while (sibling) {
                            if (sibling.tagName === 'LABEL') {
                                return sibling.textContent.trim();
                            }
                            sibling = sibling.previousElementSibling;
                        }
                        
                        return '';
                    },
                    
                    // Check if element is visible
                    isElementVisible: function(element) {
                        return element.offsetParent !== null && 
                               window.getComputedStyle(element).display !== 'none' &&
                               window.getComputedStyle(element).visibility !== 'hidden';
                    },
                    
                    // Generate CSS selector
                    generateSelector: function(element) {
                        if (element.id) return \`#\${element.id}\`;
                        if (element.name) return \`[name="\${element.name}"]\`;
                        
                        // Build path-based selector
                        const path = [];
                        let current = element;
                        
                        while (current && current.nodeType === 1 && path.length < 5) {
                            let selector = current.tagName.toLowerCase();
                            
                            if (current.className) {
                                const classes = current.className.split(/\\s+/).filter(c => c.length > 0);
                                if (classes.length > 0) {
                                    selector += '.' + classes.slice(0, 2).join('.');
                                }
                            }
                            
                            path.unshift(selector);
                            current = current.parentElement;
                        }
                        
                        return path.join(' > ');
                    },
                    
                    // Fill form with data
                    fillForm: async function(fieldMappings, options = {}) {
                        const results = {
                            filled: 0,
                            failed: 0,
                            errors: [],
                            details: []
                        };
                        
                        for (const [selector, value] of Object.entries(fieldMappings)) {
                            try {
                                const element = document.querySelector(selector);
                                if (!element) {
                                    results.failed++;
                                    results.errors.push(\`Element not found: \${selector}\`);
                                    continue;
                                }
                                
                                // Focus the element
                                element.focus();
                                
                                // Clear existing value
                                element.value = '';
                                
                                // Set new value
                                element.value = value;
                                
                                // Trigger events to ensure the page recognizes the change
                                element.dispatchEvent(new Event('input', { bubbles: true }));
                                element.dispatchEvent(new Event('change', { bubbles: true }));
                                element.dispatchEvent(new Event('blur', { bubbles: true }));
                                
                                // For special cases (React, Vue, etc.)
                                if (element._valueTracker) {
                                    element._valueTracker.setValue('');
                                }
                                
                                // Wait a bit to ensure processing
                                await new Promise(resolve => setTimeout(resolve, 50));
                                
                                results.filled++;
                                results.details.push({
                                    selector: selector,
                                    value: value,
                                    success: true
                                });
                                
                            } catch (error) {
                                results.failed++;
                                results.errors.push(\`Error filling \${selector}: \${error.message}\`);
                                results.details.push({
                                    selector: selector,
                                    value: value,
                                    success: false,
                                    error: error.message
                                });
                            }
                        }
                        
                        return results;
                    },
                    
                    // Click element
                    clickElement: function(selector) {
                        const element = document.querySelector(selector);
                        if (element) {
                            element.click();
                            return { success: true, element: selector };
                        }
                        return { success: false, error: 'Element not found' };
                    },
                    
                    // Extract text from page
                    extractText: function(selector = 'body') {
                        const element = document.querySelector(selector);
                        return element ? element.textContent.trim() : '';
                    },
                    
                    // Submit form
                    submitForm: function(formSelector = 'form') {
                        const form = document.querySelector(formSelector);
                        if (form) {
                            form.submit();
                            return { success: true };
                        }
                        return { success: false, error: 'Form not found' };
                    }
                };
                
                // Notify that automation is ready
                console.log('[Brdy Automation] Full automation capabilities loaded');
                window.dispatchEvent(new CustomEvent('brdy-automation-ready'));
            `);

            console.log('[EmbeddedBrowser] Automation scripts injected successfully');
            return { success: true };

        } catch (error) {
            console.error('[EmbeddedBrowser] Failed to inject automation scripts:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Inject Google Sheets specific automation
     */
    async injectGoogleSheetsAutomation() {
        if (!this.browserView) return;

        try {
            const GoogleSheetsInteraction = require('./googleSheetsInteraction');
            const sheetsAutomation = new GoogleSheetsInteraction();

            // Inject enhanced Google Sheets automation
            await this.browserView.webContents.executeJavaScript(`
                // Enhanced Google Sheets Automation
                window.GoogleSheetsAutomation = {
                    version: '2.0.0',
                    
                    // Detect Google Sheets with enhanced accuracy
                    detectGoogleSheets: function() {
                        const url = window.location.href.toLowerCase();
                        const title = document.title.toLowerCase();
                        
                        const isGoogleSheets = url.includes('docs.google.com/spreadsheets') || 
                                             url.includes('sheets.google.com') ||
                                             title.includes('google sheets') ||
                                             document.querySelector('[data-sheets-root]') !== null ||
                                             document.querySelector('.docs-gm') !== null ||
                                             document.querySelector('[role="grid"]') !== null;
                        
                        if (!isGoogleSheets) {
                            return { success: false, reason: 'Not a Google Sheets page' };
                        }
                        
                        return {
                            success: true,
                            platform: 'google_sheets',
                            hasGrid: !!document.querySelector('[role="grid"]'),
                            hasFormulaBar: !!document.querySelector('[aria-label*="formula"]'),
                            capabilities: ['data_entry', 'cell_manipulation', 'bulk_insert', 'formatting']
                        };
                    },
                    
                    // Fill Google Sheets with bulk data
                    fillGoogleSheets: async function(data, options = {}) {
                        const detection = this.detectGoogleSheets();
                        if (!detection.success) {
                            return { success: false, error: 'Not a Google Sheets page' };
                        }
                        
                        const results = {
                            totalCells: 0,
                            successful: 0,
                            failed: 0,
                            errors: []
                        };
                        
                        const startRow = options.startRow || 1;
                        const startCol = options.startCol || 1;
                        
                        try {
                            // Debug: Check if we're actually on a Google Sheets page with a grid
                            const gridCheck = document.querySelector('[role="grid"]');
                            const sheetsCheck = document.querySelector('[data-sheets-root]');
                            const cellsCheck = document.querySelectorAll('[role="gridcell"]');
                            
                            console.log('[DEBUG] Grid elements found:', {
                                grid: !!gridCheck,
                                sheetsRoot: !!sheetsCheck,
                                cellCount: cellsCheck.length,
                                url: window.location.href
                            });
                            
                            if (!gridCheck && !sheetsCheck) {
                                return {
                                    success: false,
                                    error: 'No interactive spreadsheet grid found. Please ensure you are on an editable Google Sheets page.',
                                    debug: {
                                        url: window.location.href,
                                        title: document.title,
                                        gridFound: false,
                                        sheetsRootFound: false
                                    }
                                };
                            }
                            
                            // Method 1: Try to select first cell and bulk paste
                            console.log('[DEBUG] Attempting to select cell A1...');
                            const cellSelection = await this.selectCell(startRow, startCol);
                            
                            if (!cellSelection.success) {
                                console.log('[DEBUG] Cell selection failed:', cellSelection.error);
                                results.errors.push('Failed to select starting cell: ' + cellSelection.error);
                            } else {
                                console.log('[DEBUG] Cell selection successful:', cellSelection);
                            }
                            
                            // Convert data to TSV format for bulk paste
                            const tsvData = data.map(row => row.join('\\t')).join('\\n');
                            console.log('[DEBUG] TSV data prepared, length:', tsvData.length);
                            
                            // Try clipboard paste approach for bulk data
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                console.log('[DEBUG] Attempting clipboard paste...');
                                
                                try {
                                    await navigator.clipboard.writeText(tsvData);
                                    console.log('[DEBUG] Data written to clipboard successfully');
                                    
                                    // Focus the active cell or grid
                                    const activeCell = document.querySelector('.docs-sheet-active-cell') ||
                                                     document.querySelector('[aria-selected="true"]') ||
                                                     document.querySelector('[role="gridcell"]');
                                    
                                    if (activeCell) {
                                        activeCell.focus();
                                        console.log('[DEBUG] Active cell focused');
                                    }
                                    
                                    // Trigger paste
                                    const pasteEvent = new KeyboardEvent('keydown', {
                                        key: 'v',
                                        ctrlKey: !navigator.platform.includes('Mac'),
                                        metaKey: navigator.platform.includes('Mac'),
                                        bubbles: true,
                                        cancelable: true
                                    });
                                    
                                    const pasteResult = document.dispatchEvent(pasteEvent);
                                    console.log('[DEBUG] Paste event dispatched, result:', pasteResult);
                                    
                                    // Wait for paste to complete and check if data actually appeared
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                    
                                    // Verify paste worked by checking if cells have content
                                    const cellsAfterPaste = document.querySelectorAll('[role="gridcell"]:not(:empty)');
                                    const hasContent = cellsAfterPaste.length > 0;
                                    
                                    console.log('[DEBUG] Post-paste verification:', {
                                        cellsWithContent: cellsAfterPaste.length,
                                        hasContent: hasContent
                                    });
                                    
                                    if (hasContent) {
                                        results.successful = data.length * (data[0]?.length || 0);
                                        results.totalCells = results.successful;
                                        
                                        return {
                                            success: true,
                                            method: 'bulk_paste',
                                            results: results,
                                            dataRows: data.length,
                                            dataCols: data[0]?.length || 0,
                                            verification: 'Data successfully pasted and verified'
                                        };
                                    } else {
                                        console.log('[DEBUG] Bulk paste failed - no content detected in cells');
                                        results.errors.push('Bulk paste appeared to fail - no content detected in cells');
                                    }
                                    
                                } catch (clipboardError) {
                                    console.log('[DEBUG] Clipboard error:', clipboardError);
                                    results.errors.push('Clipboard operation failed: ' + clipboardError.message);
                                }
                            } else {
                                console.log('[DEBUG] Clipboard API not available');
                                results.errors.push('Clipboard API not available');
                            }
                            
                            // Method 2: Individual cell filling
                            for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
                                const row = data[rowIndex];
                                for (let colIndex = 0; colIndex < row.length; colIndex++) {
                                    results.totalCells++;
                                    const value = row[colIndex];
                                    const targetRow = startRow + rowIndex;
                                    const targetCol = startCol + colIndex;
                                    
                                    try {
                                        await this.fillCell(targetRow, targetCol, value);
                                        results.successful++;
                                        await new Promise(resolve => setTimeout(resolve, 50));
                                    } catch (error) {
                                        results.failed++;
                                        results.errors.push(\`Error in cell \${targetRow},\${targetCol}: \${error.message}\`);
                                    }
                                }
                            }
                            
                            return {
                                success: true,
                                method: 'individual_cells',
                                results: results,
                                dataRows: data.length,
                                dataCols: data[0]?.length || 0
                            };
                            
                        } catch (error) {
                            return {
                                success: false,
                                error: error.message,
                                results: results
                            };
                        }
                    },
                    
                    // Select a specific cell
                    selectCell: async function(row, col) {
                        // Try name box method
                        const cellAddress = String.fromCharCode(65 + col - 1) + row;
                        const nameBox = document.querySelector('input[aria-label*="Name box"]') ||
                                       document.querySelector('#docs-name-box');
                        
                        if (nameBox) {
                            nameBox.focus();
                            nameBox.value = cellAddress;
                            nameBox.dispatchEvent(new KeyboardEvent('keydown', { 
                                key: 'Enter', 
                                bubbles: true 
                            }));
                            return { success: true, method: 'name_box', cell: cellAddress };
                        }
                        
                        // Try direct grid navigation
                        const grid = document.querySelector('[role="grid"]');
                        if (grid) {
                            const rows = grid.querySelectorAll('[role="row"]');
                            if (rows[row]) {
                                const cells = rows[row].querySelectorAll('[role="gridcell"]');
                                if (cells[col - 1]) {
                                    cells[col - 1].click();
                                    return { success: true, method: 'direct_click' };
                                }
                            }
                        }
                        
                        return { success: false, error: 'Could not select cell' };
                    },
                    
                    // Fill individual cell
                    fillCell: async function(row, col, value) {
                        // Select the cell first
                        const selection = await this.selectCell(row, col);
                        if (!selection.success) {
                            throw new Error('Could not select cell');
                        }
                        
                        // Wait a moment for selection
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        // Try to find input element
                        let inputElement = document.querySelector('.cell-input') ||
                                         document.querySelector('[aria-label*="formula"]') ||
                                         document.querySelector('#docs-formula-bar-input');
                        
                        // If no input found, try to activate edit mode
                        if (!inputElement) {
                            // Double click the active cell
                            const activeCell = document.querySelector('.docs-sheet-active-cell') ||
                                             document.querySelector('[aria-selected="true"]');
                            if (activeCell) {
                                activeCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                                await new Promise(resolve => setTimeout(resolve, 100));
                                inputElement = document.querySelector('.cell-input');
                            }
                        }
                        
                        // If still no input, try F2 key
                        if (!inputElement) {
                            document.dispatchEvent(new KeyboardEvent('keydown', { 
                                key: 'F2', 
                                bubbles: true 
                            }));
                            await new Promise(resolve => setTimeout(resolve, 100));
                            inputElement = document.querySelector('.cell-input') ||
                                         document.activeElement;
                        }
                        
                        // Input the value
                        if (inputElement) {
                            inputElement.focus();
                            inputElement.value = value;
                            
                            // Trigger events
                            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                            
                            // Press Enter to confirm
                            inputElement.dispatchEvent(new KeyboardEvent('keydown', {
                                key: 'Enter',
                                bubbles: true
                            }));
                            
                            return { success: true, value: value };
                        }
                        
                        throw new Error('Could not find input element');
                    },
                    
                    // Generate mock data for Google Sheets
                    generateMockData: function(type, count = 10) {
                        const data = [];
                        
                        switch (type.toLowerCase()) {
                            case 'sales':
                            case 'revenue':
                                data.push(['Company', 'Revenue', 'Status', 'Priority', 'Date']);
                                const companies = ['TechCorp Inc', 'Global Solutions', 'Innovation Partners', 'Digital Dynamics', 'Future Systems'];
                                const revenues = [150000, 250000, 350000, 450000, 550000];
                                const statuses = ['Active', 'Pending', 'Completed', 'In Progress'];
                                const priorities = ['High', 'Medium', 'Low'];
                                
                                for (let i = 0; i < count; i++) {
                                    data.push([
                                        companies[i % companies.length],
                                        '$' + revenues[i % revenues.length].toLocaleString(),
                                        statuses[i % statuses.length],
                                        priorities[i % priorities.length],
                                        new Date(Date.now() + (i - count/2) * 24 * 60 * 60 * 1000).toLocaleDateString()
                                    ]);
                                }
                                break;
                                
                            case 'people':
                            case 'employees':
                            case 'contacts':
                                data.push(['Name', 'Email', 'Phone', 'Department', 'Start Date']);
                                const names = ['John Smith', 'Jane Doe', 'Mike Johnson', 'Sarah Wilson', 'Chris Brown'];
                                const domains = ['@techcorp.com', '@company.com', '@business.org'];
                                const departments = ['Sales', 'Marketing', 'Engineering', 'HR', 'Finance'];
                                
                                for (let i = 0; i < count; i++) {
                                    const name = names[i % names.length];
                                    const email = name.toLowerCase().replace(' ', '.') + domains[i % domains.length];
                                    data.push([
                                        name,
                                        email,
                                        '(555) ' + Math.floor(Math.random() * 900 + 100) + '-' + Math.floor(Math.random() * 9000 + 1000),
                                        departments[i % departments.length],
                                        new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toLocaleDateString()
                                    ]);
                                }
                                break;
                                
                            case 'projects':
                            case 'tasks':
                                data.push(['Project Name', 'Assignee', 'Status', 'Priority', 'Due Date']);
                                const assignees = ['John Smith', 'Jane Doe', 'Mike Johnson', 'Sarah Wilson'];
                                const projectStatuses = ['Not Started', 'In Progress', 'Review', 'Completed'];
                                
                                for (let i = 0; i < count; i++) {
                                    data.push([
                                        \`Project \${i + 1}\`,
                                        assignees[i % assignees.length],
                                        projectStatuses[i % projectStatuses.length],
                                        priorities[i % priorities.length],
                                        new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000).toLocaleDateString()
                                    ]);
                                }
                                break;
                                
                            default:
                                data.push(['Item', 'Value', 'Category', 'Date', 'Amount']);
                                for (let i = 0; i < count; i++) {
                                    data.push([
                                        \`Item \${i + 1}\`,
                                        Math.floor(Math.random() * 1000),
                                        ['Category A', 'Category B', 'Category C'][i % 3],
                                        new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
                                        '$' + (Math.random() * 1000).toFixed(2)
                                    ]);
                                }
                        }
                        
                        return data;
                    }
                };
                
                console.log('[Brdy Automation] Google Sheets automation enhanced');
            `);

            console.log('[EmbeddedBrowser] Google Sheets automation injected');

        } catch (error) {
            console.error('[EmbeddedBrowser] Failed to inject Google Sheets automation:', error);
        }
    }

    /**
     * Execute automation command
     */
    async executeCommand(command, params = {}) {
        if (!this.isBrowserReady()) {
            throw new Error('Browser not ready or has been destroyed');
        }

        try {
            const result = await this.browserView.webContents.executeJavaScript(`
                (function() {
                    if (!window.BrdyAutomation) {
                        return { success: false, error: 'Automation not ready' };
                    }
                    
                    switch ('${command}') {
                        case 'detectPage':
                            return window.BrdyAutomation.detectPage();
                        case 'detectFormFields':
                            return window.BrdyAutomation.detectFormFields();
                        case 'fillForm':
                            return window.BrdyAutomation.fillForm(${JSON.stringify(params.mappings || {})});
                        case 'clickElement':
                            return window.BrdyAutomation.clickElement('${params.selector || ''}');
                        case 'extractText':
                            return window.BrdyAutomation.extractText('${params.selector || 'body'}');
                        case 'submitForm':
                            return window.BrdyAutomation.submitForm('${params.formSelector || 'form'}');
                        // Google Sheets commands
                        case 'detectGoogleSheets':
                            return window.GoogleSheetsAutomation?.detectGoogleSheets() || { success: false, error: 'Google Sheets automation not available' };
                        case 'fillGoogleSheets':
                            return window.GoogleSheetsAutomation?.fillGoogleSheets(${JSON.stringify(params.data || [])}, ${JSON.stringify(params.options || {})}) || { success: false, error: 'Google Sheets automation not available' };
                        case 'generateMockData':
                            return window.GoogleSheetsAutomation?.generateMockData('${params.type || 'sales'}', ${params.count || 10}) || { success: false, error: 'Google Sheets automation not available' };
                        default:
                            return { success: false, error: 'Unknown command: ${command}' };
                    }
                })()
            `);

            return { success: true, result: result };

        } catch (error) {
            console.error(`[EmbeddedBrowser] Command '${command}' failed:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Setup navigation event handlers
     */
    setupNavigationEvents() {
        if (!this.browserView) return;

        this.browserView.webContents.on('did-navigate', (event, url) => {
            console.log(`[EmbeddedBrowser] Navigated to: ${url}`);
        });

        this.browserView.webContents.on('page-title-updated', (event, title) => {
            if (this.parentWindow) {
                this.parentWindow.setTitle(`Brdy Orbit Browser - ${title}`);
            }
        });
    }

    /**
     * Close browser
     */
    close() {
        try {
            if (this.browserView && !this.browserView.webContents.isDestroyed()) {
                console.log('[EmbeddedBrowser] Cleaning up browser view...');
                this.browserView.webContents.removeAllListeners();
            }
            
            if (this.parentWindow && !this.parentWindow.isDestroyed()) {
                console.log('[EmbeddedBrowser] Closing parent window...');
                this.parentWindow.close();
            }
        } catch (error) {
            console.error('[EmbeddedBrowser] Error during cleanup:', error);
        } finally {
            this.parentWindow = null;
            this.browserView = null;
            this.isReady = false;
        }
    }

    /**
     * Check if browser is ready and functional
     */
    isBrowserReady() {
        return this.isReady && 
               this.browserView && 
               this.browserView.webContents && 
               !this.browserView.webContents.isDestroyed() &&
               this.parentWindow &&
               !this.parentWindow.isDestroyed();
    }

    /**
     * Get current page info
     */
    async getCurrentPageInfo() {
        if (!this.isBrowserReady()) {
            return {
                detection: null,
                fields: null,
                url: null,
                title: null,
                error: 'Browser not ready'
            };
        }

        try {
            const detection = await this.executeCommand('detectPage');
            const fields = await this.executeCommand('detectFormFields');
            
            return {
                detection: detection.result,
                fields: fields.result,
                url: this.browserView.webContents.getURL(),
                title: this.browserView.webContents.getTitle()
            };
        } catch (error) {
            console.error('[EmbeddedBrowser] Error getting page info:', error);
            return {
                detection: null,
                fields: null,
                url: null,
                title: null,
                error: error.message
            };
        }
    }
}

module.exports = EmbeddedBrowser;