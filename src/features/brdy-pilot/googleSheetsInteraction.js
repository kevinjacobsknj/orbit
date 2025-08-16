/**
 * Google Sheets Interaction Module for Brdy Pilot
 * Provides specialized functions for detecting and manipulating Google Sheets
 */

class GoogleSheetsInteraction {
    constructor() {
        this.mockDataTemplates = {
            people: {
                names: ['John Smith', 'Jane Doe', 'Mike Johnson', 'Sarah Wilson', 'Chris Brown', 'Emily Davis', 'David Miller', 'Lisa Garcia', 'Tom Anderson', 'Maria Rodriguez'],
                emails: ['john.smith@email.com', 'jane.doe@email.com', 'mike.johnson@email.com', 'sarah.wilson@email.com', 'chris.brown@email.com', 'emily.davis@email.com', 'david.miller@email.com', 'lisa.garcia@email.com', 'tom.anderson@email.com', 'maria.rodriguez@email.com'],
                phones: ['(555) 123-4567', '(555) 234-5678', '(555) 345-6789', '(555) 456-7890', '(555) 567-8901', '(555) 678-9012', '(555) 789-0123', '(555) 890-1234', '(555) 901-2345', '(555) 012-3456'],
                ages: [25, 28, 32, 29, 35, 26, 31, 27, 33, 30],
                departments: ['Sales', 'Marketing', 'Engineering', 'HR', 'Finance', 'Operations', 'Support', 'Design', 'Legal', 'IT']
            },
            business: {
                companies: ['TechCorp Inc', 'Global Solutions LLC', 'Innovation Partners', 'Digital Dynamics', 'Future Systems', 'Smart Solutions', 'DataTech Corp', 'CloudFirst Inc', 'NextGen Solutions', 'ProTech Ltd'],
                revenues: [150000, 250000, 350000, 450000, 550000, 650000, 750000, 850000, 950000, 1050000],
                statuses: ['Active', 'Pending', 'Completed', 'In Progress', 'On Hold', 'Cancelled', 'Approved', 'Rejected', 'Under Review', 'Archived'],
                priorities: ['High', 'Medium', 'Low', 'Critical', 'Normal'],
                categories: ['Product', 'Service', 'Marketing', 'Sales', 'Support', 'Development', 'Research', 'Operations', 'Finance', 'HR']
            },
            dates: {
                recent: this.generateRecentDates(10),
                future: this.generateFutureDates(10),
                past: this.generatePastDates(10)
            }
        };
    }

    /**
     * Detect if current page is Google Sheets
     */
    detectGoogleSheets() {
        return `
            (function() {
                const url = window.location.href.toLowerCase();
                const title = document.title.toLowerCase();
                
                // Check for Google Sheets URL patterns
                const isGoogleSheets = url.includes('docs.google.com/spreadsheets') || 
                                      url.includes('sheets.google.com') ||
                                      title.includes('google sheets') ||
                                      document.querySelector('[data-sheets-root]') !== null ||
                                      document.querySelector('.docs-gm') !== null;
                
                if (!isGoogleSheets) {
                    return {
                        isGoogleSheets: false,
                        confidence: 0,
                        reason: 'Not a Google Sheets page'
                    };
                }
                
                // Analyze sheet structure
                const sheetsGrid = document.querySelector('[role="grid"]') || 
                                  document.querySelector('.docs-sheet-container') ||
                                  document.querySelector('[data-sheets-root]');
                
                const selectedCell = document.querySelector('.docs-sheet-active-cell') ||
                                   document.querySelector('[aria-selected="true"]') ||
                                   document.querySelector('.cell-input');
                
                const formulaBar = document.querySelector('[aria-label*="formula"]') ||
                                 document.querySelector('#t-formula-bar') ||
                                 document.querySelector('.docs-formula-bar');
                
                return {
                    isGoogleSheets: true,
                    confidence: 0.95,
                    hasGrid: !!sheetsGrid,
                    hasSelectedCell: !!selectedCell,
                    hasFormulaBar: !!formulaBar,
                    gridSelector: sheetsGrid ? this.generateSelector(sheetsGrid) : null,
                    cellSelector: selectedCell ? this.generateSelector(selectedCell) : null,
                    capabilities: [
                        'cell_editing',
                        'data_entry', 
                        'formula_insertion',
                        'row_column_manipulation',
                        'formatting'
                    ]
                };
            })()
        `;
    }

    /**
     * Find and select cells in Google Sheets
     */
    findAndSelectCell(row, col) {
        return `
            (function(targetRow, targetCol) {
                // Try different methods to select a cell
                const methods = [
                    // Method 1: Direct cell selection by coordinate
                    function() {
                        const cellAddress = String.fromCharCode(65 + targetCol - 1) + targetRow;
                        const nameBox = document.querySelector('input[aria-label*="Name box"]') ||
                                       document.querySelector('#docs-name-box') ||
                                       document.querySelector('[aria-label*="cell reference"]');
                        
                        if (nameBox) {
                            nameBox.focus();
                            nameBox.value = cellAddress;
                            nameBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                            return { success: true, method: 'nameBox', cell: cellAddress };
                        }
                        return { success: false };
                    },
                    
                    // Method 2: Click on specific cell
                    function() {
                        const cells = document.querySelectorAll('[role="gridcell"]');
                        const targetIndex = (targetRow - 1) * 26 + (targetCol - 1); // Rough estimate
                        
                        if (cells[targetIndex]) {
                            cells[targetIndex].click();
                            return { success: true, method: 'directClick', index: targetIndex };
                        }
                        return { success: false };
                    },
                    
                    // Method 3: Find cell by data attributes or position
                    function() {
                        const grid = document.querySelector('[role="grid"]');
                        if (!grid) return { success: false };
                        
                        const rows = grid.querySelectorAll('[role="row"]');
                        if (rows[targetRow]) {
                            const cells = rows[targetRow].querySelectorAll('[role="gridcell"]');
                            if (cells[targetCol - 1]) {
                                cells[targetCol - 1].click();
                                return { success: true, method: 'gridNavigation' };
                            }
                        }
                        return { success: false };
                    }
                ];
                
                // Try each method until one succeeds
                for (let i = 0; i < methods.length; i++) {
                    const result = methods[i]();
                    if (result.success) {
                        return { success: true, ...result, row: targetRow, col: targetCol };
                    }
                }
                
                return { success: false, error: 'Could not select cell', row: targetRow, col: targetCol };
                
            })(${row}, ${col})
        `;
    }

    /**
     * Insert data into the currently selected cell
     */
    insertDataIntoCell(data, moveToNext = true) {
        return `
            (function(data, moveNext) {
                try {
                    // Find the active cell or formula bar
                    let inputElement = document.querySelector('.cell-input') ||
                                     document.querySelector('[aria-label*="formula"]') ||
                                     document.querySelector('#docs-formula-bar-input') ||
                                     document.querySelector('.docs-formula-bar input') ||
                                     document.activeElement;
                    
                    // If no input element found, try to activate one
                    if (!inputElement || inputElement.tagName !== 'INPUT') {
                        // Try to double-click the active cell to enter edit mode
                        const activeCell = document.querySelector('.docs-sheet-active-cell') ||
                                         document.querySelector('[aria-selected="true"]') ||
                                         document.querySelector('.cell-selected');
                        
                        if (activeCell) {
                            // Double click to enter edit mode
                            activeCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                            
                            // Wait a bit and try to find input again
                            setTimeout(() => {
                                inputElement = document.querySelector('.cell-input') ||
                                             document.querySelector('[aria-label*="formula"]') ||
                                             document.activeElement;
                            }, 100);
                        }
                    }
                    
                    // If still no input, try pressing F2 or Enter to activate edit mode
                    if (!inputElement || inputElement.tagName !== 'INPUT') {
                        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
                        
                        setTimeout(() => {
                            inputElement = document.querySelector('.cell-input') ||
                                         document.querySelector('[contenteditable="true"]') ||
                                         document.activeElement;
                        }, 100);
                    }
                    
                    // Insert the data
                    if (inputElement) {
                        inputElement.focus();
                        inputElement.value = data;
                        
                        // Trigger input events
                        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        // Press Enter to confirm the entry
                        inputElement.dispatchEvent(new KeyboardEvent('keydown', { 
                            key: 'Enter', 
                            bubbles: true,
                            cancelable: true 
                        }));
                        
                        // Move to next cell if requested
                        if (moveNext) {
                            setTimeout(() => {
                                document.dispatchEvent(new KeyboardEvent('keydown', { 
                                    key: 'Tab', 
                                    bubbles: true 
                                }));
                            }, 100);
                        }
                        
                        return { 
                            success: true, 
                            data: data, 
                            method: 'input_element',
                            elementType: inputElement.tagName 
                        };
                    }
                    
                    // Fallback: try to insert directly into active cell
                    const activeCell = document.querySelector('.docs-sheet-active-cell') ||
                                     document.querySelector('[aria-selected="true"]');
                    
                    if (activeCell) {
                        // Try using clipboard
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(data).then(() => {
                                document.dispatchEvent(new KeyboardEvent('keydown', { 
                                    key: 'v', 
                                    ctrlKey: true, 
                                    bubbles: true 
                                }));
                            });
                            
                            return { success: true, data: data, method: 'clipboard' };
                        }
                    }
                    
                    return { success: false, error: 'No input method available' };
                    
                } catch (error) {
                    return { success: false, error: error.message };
                }
            })(${JSON.stringify(data)}, ${moveToNext})
        `;
    }

    /**
     * Insert multiple rows of data
     */
    insertBulkData(dataMatrix, startRow = 1, startCol = 1) {
        return `
            (function(data, startRow, startCol) {
                const results = {
                    totalCells: 0,
                    successful: 0,
                    failed: 0,
                    errors: []
                };
                
                // Function to select and fill a cell
                async function fillCell(row, col, value) {
                    try {
                        // Calculate cell address
                        const cellAddress = String.fromCharCode(65 + col - 1) + row;
                        
                        // Try to select the cell using name box
                        const nameBox = document.querySelector('input[aria-label*="Name box"]') ||
                                       document.querySelector('#docs-name-box');
                        
                        if (nameBox) {
                            nameBox.focus();
                            nameBox.value = cellAddress;
                            nameBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                            
                            // Wait a moment for selection
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }
                        
                        // Find and use the input element
                        let inputElement = document.querySelector('.cell-input') ||
                                         document.querySelector('[aria-label*="formula"]');
                        
                        if (!inputElement) {
                            // Double click to enter edit mode
                            const activeCell = document.querySelector('.docs-sheet-active-cell');
                            if (activeCell) {
                                activeCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                                await new Promise(resolve => setTimeout(resolve, 50));
                                inputElement = document.querySelector('.cell-input');
                            }
                        }
                        
                        if (inputElement) {
                            inputElement.focus();
                            inputElement.value = value;
                            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                            inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                            
                            results.successful++;
                            return true;
                        }
                        
                        results.failed++;
                        results.errors.push(\`Failed to input in cell \${cellAddress}\`);
                        return false;
                        
                    } catch (error) {
                        results.failed++;
                        results.errors.push(\`Error in cell \${row},\${col}: \${error.message}\`);
                        return false;
                    }
                }
                
                // Process all data
                async function processData() {
                    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
                        const row = data[rowIndex];
                        for (let colIndex = 0; colIndex < row.length; colIndex++) {
                            results.totalCells++;
                            const value = row[colIndex];
                            const targetRow = startRow + rowIndex;
                            const targetCol = startCol + colIndex;
                            
                            await fillCell(targetRow, targetCol, value);
                            
                            // Small delay between cells
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }
                    
                    return results;
                }
                
                return processData();
                
            })(${JSON.stringify(dataMatrix)}, ${startRow}, ${startCol})
        `;
    }

    /**
     * Generate mock data for different scenarios
     */
    generateMockData(type, count = 10) {
        const data = [];
        
        switch (type.toLowerCase()) {
            case 'people':
            case 'employees':
            case 'contacts':
                data.push(['Name', 'Email', 'Phone', 'Age', 'Department']); // Headers
                for (let i = 0; i < count; i++) {
                    data.push([
                        this.getRandomItem(this.mockDataTemplates.people.names),
                        this.getRandomItem(this.mockDataTemplates.people.emails),
                        this.getRandomItem(this.mockDataTemplates.people.phones),
                        this.getRandomItem(this.mockDataTemplates.people.ages),
                        this.getRandomItem(this.mockDataTemplates.people.departments)
                    ]);
                }
                break;
                
            case 'sales':
            case 'revenue':
                data.push(['Company', 'Revenue', 'Status', 'Priority', 'Date']);
                for (let i = 0; i < count; i++) {
                    data.push([
                        this.getRandomItem(this.mockDataTemplates.business.companies),
                        this.getRandomItem(this.mockDataTemplates.business.revenues),
                        this.getRandomItem(this.mockDataTemplates.business.statuses),
                        this.getRandomItem(this.mockDataTemplates.business.priorities),
                        this.getRandomItem(this.mockDataTemplates.dates.recent)
                    ]);
                }
                break;
                
            case 'projects':
            case 'tasks':
                data.push(['Project Name', 'Assignee', 'Status', 'Priority', 'Due Date']);
                for (let i = 0; i < count; i++) {
                    data.push([
                        `Project ${i + 1}`,
                        this.getRandomItem(this.mockDataTemplates.people.names),
                        this.getRandomItem(this.mockDataTemplates.business.statuses),
                        this.getRandomItem(this.mockDataTemplates.business.priorities),
                        this.getRandomItem(this.mockDataTemplates.dates.future)
                    ]);
                }
                break;
                
            case 'inventory':
            case 'products':
                data.push(['Product Name', 'SKU', 'Category', 'Price', 'Stock']);
                for (let i = 0; i < count; i++) {
                    data.push([
                        `Product ${i + 1}`,
                        `SKU${String(i + 1).padStart(3, '0')}`,
                        this.getRandomItem(this.mockDataTemplates.business.categories),
                        Math.floor(Math.random() * 500) + 10,
                        Math.floor(Math.random() * 100) + 1
                    ]);
                }
                break;
                
            case 'financial':
            case 'transactions':
                data.push(['Date', 'Description', 'Amount', 'Category', 'Account']);
                for (let i = 0; i < count; i++) {
                    data.push([
                        this.getRandomItem(this.mockDataTemplates.dates.past),
                        `Transaction ${i + 1}`,
                        (Math.random() * 1000).toFixed(2),
                        this.getRandomItem(this.mockDataTemplates.business.categories),
                        `Account ${Math.floor(Math.random() * 5) + 1}`
                    ]);
                }
                break;
                
            default:
                // Generic data
                data.push(['Column A', 'Column B', 'Column C', 'Column D', 'Column E']);
                for (let i = 0; i < count; i++) {
                    data.push([
                        `Item ${i + 1}`,
                        Math.floor(Math.random() * 100),
                        this.getRandomItem(['Active', 'Inactive', 'Pending']),
                        new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toLocaleDateString(),
                        (Math.random() * 1000).toFixed(2)
                    ]);
                }
        }
        
        return data;
    }

    /**
     * Helper functions
     */
    getRandomItem(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    generateRecentDates(count) {
        const dates = [];
        for (let i = 0; i < count; i++) {
            const date = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
            dates.push(date.toLocaleDateString());
        }
        return dates;
    }

    generateFutureDates(count) {
        const dates = [];
        for (let i = 0; i < count; i++) {
            const date = new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000);
            dates.push(date.toLocaleDateString());
        }
        return dates;
    }

    generatePastDates(count) {
        const dates = [];
        for (let i = 0; i < count; i++) {
            const date = new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000);
            dates.push(date.toLocaleDateString());
        }
        return dates;
    }

    /**
     * Generate CSS selector for an element
     */
    generateSelectorScript() {
        return `
            function generateSelector(element) {
                if (element.id) return '#' + element.id;
                if (element.className) return '.' + element.className.split(' ').join('.');
                
                let path = [];
                let current = element;
                
                while (current && current.nodeType === 1) {
                    let selector = current.tagName.toLowerCase();
                    if (current.className) {
                        selector += '.' + current.className.split(' ').join('.');
                    }
                    path.unshift(selector);
                    current = current.parentElement;
                    if (path.length > 4) break;
                }
                
                return path.join(' > ');
            }
        `;
    }

    /**
     * Complete Google Sheets automation script
     */
    getCompleteScript() {
        return `
            ${this.generateSelectorScript()}
            
            window.GoogleSheetsAutomation = {
                ${this.detectGoogleSheets().slice(19, -13)}, // Remove function wrapper
                
                findAndSelectCell: ${this.findAndSelectCell(1, 1).slice(19, -13)},
                
                insertDataIntoCell: ${this.insertDataIntoCell('data', true).slice(19, -13)},
                
                insertBulkData: ${this.insertBulkData([[]], 1, 1).slice(19, -13)},
                
                generateMockData: function(type, count) {
                    const templates = ${JSON.stringify(this.mockDataTemplates)};
                    
                    function getRandomItem(array) {
                        return array[Math.floor(Math.random() * array.length)];
                    }
                    
                    function generateDates(days, future = false) {
                        const dates = [];
                        for (let i = 0; i < 10; i++) {
                            const multiplier = future ? 1 : -1;
                            const date = new Date(Date.now() + multiplier * Math.random() * days * 24 * 60 * 60 * 1000);
                            dates.push(date.toLocaleDateString());
                        }
                        return dates;
                    }
                    
                    const data = [];
                    
                    switch (type.toLowerCase()) {
                        case 'people':
                        case 'employees':
                        case 'contacts':
                            data.push(['Name', 'Email', 'Phone', 'Age', 'Department']);
                            for (let i = 0; i < count; i++) {
                                data.push([
                                    getRandomItem(templates.people.names),
                                    getRandomItem(templates.people.emails),
                                    getRandomItem(templates.people.phones),
                                    getRandomItem(templates.people.ages),
                                    getRandomItem(templates.people.departments)
                                ]);
                            }
                            break;
                            
                        case 'sales':
                        case 'revenue':
                            data.push(['Company', 'Revenue', 'Status', 'Priority', 'Date']);
                            for (let i = 0; i < count; i++) {
                                data.push([
                                    getRandomItem(templates.business.companies),
                                    '$' + getRandomItem(templates.business.revenues).toLocaleString(),
                                    getRandomItem(templates.business.statuses),
                                    getRandomItem(templates.business.priorities),
                                    generateDates(30)[Math.floor(Math.random() * 10)]
                                ]);
                            }
                            break;
                            
                        case 'projects':
                        case 'tasks':
                            data.push(['Project Name', 'Assignee', 'Status', 'Priority', 'Due Date']);
                            for (let i = 0; i < count; i++) {
                                data.push([
                                    'Project ' + (i + 1),
                                    getRandomItem(templates.people.names),
                                    getRandomItem(templates.business.statuses),
                                    getRandomItem(templates.business.priorities),
                                    generateDates(90, true)[Math.floor(Math.random() * 10)]
                                ]);
                            }
                            break;
                            
                        default:
                            data.push(['Column A', 'Column B', 'Column C', 'Column D', 'Column E']);
                            for (let i = 0; i < count; i++) {
                                data.push([
                                    'Item ' + (i + 1),
                                    Math.floor(Math.random() * 100),
                                    getRandomItem(['Active', 'Inactive', 'Pending']),
                                    new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toLocaleDateString(),
                                    '$' + (Math.random() * 1000).toFixed(2)
                                ]);
                            }
                    }
                    
                    return data;
                },
                
                // Main automation function
                addMockDataToSheet: async function(dataType = 'people', rowCount = 10, startRow = 1, startCol = 1) {
                    try {
                        console.log('[Google Sheets Automation] Starting mock data insertion...');
                        
                        // First, detect if we're in Google Sheets
                        const detection = this.detectGoogleSheets();
                        if (!detection.isGoogleSheets) {
                            return { success: false, error: 'Not a Google Sheets page' };
                        }
                        
                        console.log('[Google Sheets Automation] Google Sheets detected, generating data...');
                        
                        // Generate mock data
                        const mockData = this.generateMockData(dataType, rowCount);
                        console.log('[Google Sheets Automation] Generated data:', mockData);
                        
                        // Insert the data
                        const result = await this.insertBulkData(mockData, startRow, startCol);
                        
                        console.log('[Google Sheets Automation] Insertion complete:', result);
                        
                        return {
                            success: true,
                            dataType: dataType,
                            rowsInserted: mockData.length,
                            columnsInserted: mockData[0] ? mockData[0].length : 0,
                            startPosition: { row: startRow, col: startCol },
                            result: result
                        };
                        
                    } catch (error) {
                        console.error('[Google Sheets Automation] Error:', error);
                        return { success: false, error: error.message };
                    }
                }
            };
            
            console.log('[Brdy Pilot] Google Sheets automation ready');
        `;
    }
}

module.exports = GoogleSheetsInteraction;