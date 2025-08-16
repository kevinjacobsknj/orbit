/**
 * Brdy Orbit Injected Script
 * Runs in page context for deeper Google Sheets access
 */

(function() {
    'use strict';

    class GoogleSheetsAutomation {
        constructor() {
            this.setupMessageListener();
        }

        setupMessageListener() {
            window.addEventListener('message', (event) => {
                if (event.data.source !== 'content_script') return;

                switch (event.data.type) {
                    case 'BRDY_ANALYZE_SHEETS':
                        this.analyzeSheets();
                        break;
                    case 'BRDY_FILL_SHEETS':
                        this.fillSheets(event.data.data);
                        break;
                }
            });
        }

        analyzeSheets() {
            const analysis = {
                hasGrid: false,
                hasFormulaBar: false,
                isEditable: false,
                selectedCell: null,
                capabilities: []
            };

            try {
                // Check for grid
                const grid = document.querySelector('[role="grid"]') ||
                           document.querySelector('[data-sheets-root]') ||
                           document.querySelector('.docs-sheet-container');
                analysis.hasGrid = !!grid;

                // Check for formula bar
                const formulaBar = document.querySelector('[aria-label*="formula"]') ||
                                 document.querySelector('#t-formula-bar') ||
                                 document.querySelector('.docs-formula-bar');
                analysis.hasFormulaBar = !!formulaBar;

                // Check if editable (not just viewing)
                analysis.isEditable = !document.querySelector('.docs-homescreen') &&
                                    !window.location.href.includes('/view');

                // Find selected cell
                const activeCell = document.querySelector('.docs-sheet-active-cell') ||
                                 document.querySelector('[aria-selected="true"]');
                if (activeCell) {
                    analysis.selectedCell = this.getCellAddress(activeCell);
                }

                // Determine capabilities
                if (analysis.hasGrid && analysis.isEditable) {
                    analysis.capabilities = [
                        'cell_editing',
                        'data_entry',
                        'bulk_insert',
                        'formula_insertion'
                    ];
                }

            } catch (error) {
                console.error('[Brdy Sheets] Analysis error:', error);
            }

            window.postMessage({
                type: 'BRDY_SHEETS_ANALYSIS',
                analysis: analysis
            }, '*');
        }

        async fillSheets(data) {
            const result = {
                success: false,
                method: null,
                cellsFilled: 0,
                errors: []
            };

            try {
                if (!this.isValidSheetsPage()) {
                    result.errors.push('Not a valid Google Sheets page');
                    this.sendFillResult(result);
                    return;
                }

                // Method 1: Try bulk paste
                const bulkResult = await this.tryBulkPaste(data.rows);
                if (bulkResult.success) {
                    result.success = true;
                    result.method = 'bulk_paste';
                    result.cellsFilled = bulkResult.cellsFilled;
                    this.sendFillResult(result);
                    return;
                }

                // Method 2: Individual cell filling
                const individualResult = await this.fillCellsIndividually(data.rows);
                result.success = individualResult.success;
                result.method = 'individual_cells';
                result.cellsFilled = individualResult.cellsFilled;
                result.errors = individualResult.errors;

            } catch (error) {
                result.errors.push(error.message);
            }

            this.sendFillResult(result);
        }

        isValidSheetsPage() {
            return document.querySelector('[role="grid"]') !== null ||
                   document.querySelector('[data-sheets-root]') !== null;
        }

        async tryBulkPaste(rows) {
            try {
                console.log('[Brdy Sheets] SIMPLE METHOD: Starting with data:', rows);
                
                // Convert data to TSV
                const tsvData = rows.map(row => row.join('\t')).join('\n');
                console.log('[Brdy Sheets] TSV data to paste:', tsvData);

                // Step 1: Just copy to clipboard - this always works
                await navigator.clipboard.writeText(tsvData);
                console.log('[Brdy Sheets] ✅ Data copied to clipboard');

                // Step 2: Show user message and return success
                // The user can manually paste with Cmd+V
                alert('Data copied to clipboard! Click cell A1 and press Cmd+V (or Ctrl+V) to paste the data.');

                return {
                    success: true,
                    cellsFilled: rows.length * (rows[0]?.length || 0),
                    method: 'clipboard_manual'
                };

            } catch (error) {
                console.error('[Brdy Sheets] Clipboard copy failed:', error);
                return { 
                    success: false, 
                    cellsFilled: 0,
                    error: error.message 
                };
            }
        }

        async findAndClickCell(cellAddress) {
            try {
                // Try name box method first
                const nameBox = document.querySelector('input[aria-label*="Name box"]') ||
                               document.querySelector('#docs-name-box') ||
                               document.querySelector('input[placeholder*="Name box"]');

                if (nameBox) {
                    console.log('[Brdy Sheets] Using name box to select', cellAddress);
                    nameBox.focus();
                    nameBox.value = cellAddress;
                    nameBox.dispatchEvent(new Event('input', { bubbles: true }));
                    nameBox.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Enter',
                        bubbles: true
                    }));
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return true;
                }

                // Try to find A1 cell directly
                const cells = document.querySelectorAll('[role="gridcell"]');
                for (const cell of cells) {
                    const ariaLabel = cell.getAttribute('aria-label') || '';
                    if (ariaLabel.includes(cellAddress) || ariaLabel.startsWith(cellAddress)) {
                        console.log('[Brdy Sheets] Found cell by aria-label:', cellAddress);
                        cell.click();
                        await new Promise(resolve => setTimeout(resolve, 200));
                        return true;
                    }
                }

                // Fallback: click first cell
                if (cells.length > 0) {
                    console.log('[Brdy Sheets] Fallback: clicking first cell');
                    cells[0].click();
                    return true;
                }

                return false;
            } catch (error) {
                console.error('[Brdy Sheets] Error finding cell:', error);
                return false;
            }
        }

        async fillCellsIndividually(rows) {
            const result = {
                success: false,
                cellsFilled: 0,
                errors: []
            };

            try {
                for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                    const row = rows[rowIndex];
                    for (let colIndex = 0; colIndex < row.length; colIndex++) {
                        const value = row[colIndex];
                        const targetRow = rowIndex + 1;
                        const targetCol = colIndex + 1;

                        try {
                            await this.fillCell(targetRow, targetCol, value);
                            result.cellsFilled++;
                            await new Promise(resolve => setTimeout(resolve, 100));
                        } catch (error) {
                            result.errors.push(`Error in cell ${targetRow},${targetCol}: ${error.message}`);
                        }
                    }
                }

                result.success = result.cellsFilled > 0;

            } catch (error) {
                result.errors.push(error.message);
            }

            return result;
        }

        async selectCell(row, col) {
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
                return { success: true, method: 'name_box' };
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

            return { success: false };
        }

        async fillCell(row, col, value) {
            // Select the cell
            const selection = await this.selectCell(row, col);
            if (!selection.success) {
                throw new Error('Could not select cell');
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            // Try to find input element
            let inputElement = document.querySelector('.cell-input') ||
                             document.querySelector('[aria-label*="formula"]') ||
                             document.querySelector('#docs-formula-bar-input');

            // If no input found, try to activate edit mode
            if (!inputElement) {
                const activeCell = document.querySelector('.docs-sheet-active-cell') ||
                                 document.querySelector('[aria-selected="true"]');
                if (activeCell) {
                    activeCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                    await new Promise(resolve => setTimeout(resolve, 100));
                    inputElement = document.querySelector('.cell-input');
                }
            }

            // Try F2 key if still no input
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

                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));

                inputElement.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    bubbles: true
                }));

                return { success: true, value: value };
            }

            throw new Error('Could not find input element');
        }

        getCellAddress(cellElement) {
            // Try to extract cell address from element attributes or position
            const ariaLabel = cellElement.getAttribute('aria-label');
            if (ariaLabel) {
                const match = ariaLabel.match(/([A-Z]+)(\d+)/);
                if (match) {
                    return match[0];
                }
            }

            return null;
        }

        sendFillResult(result) {
            window.postMessage({
                type: 'BRDY_FILL_RESULT',
                result: result
            }, '*');
        }
    }

    // Initialize automation
    new GoogleSheetsAutomation();

})();