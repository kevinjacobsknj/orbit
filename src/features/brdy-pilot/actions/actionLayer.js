/**
 * Brdy Pilot Action Layer
 * Handles DOM manipulation, email insertion, and diff preview/apply/undo operations
 */

const internalBridge = require('../../../bridge/internalBridge');

class ActionLayer {
    constructor() {
        this.actionHistory = [];
        this.undoStack = [];
        this.redoStack = [];
        this.previewMode = false;
        this.currentPreview = null;
        this.init();
    }

    init() {
        // Listen for action requests
        internalBridge.on('brdy-pilot:action:domFill', this.handleDomFill.bind(this));
        internalBridge.on('brdy-pilot:action:emailInsert', this.handleEmailInsert.bind(this));
        internalBridge.on('brdy-pilot:action:preview', this.handlePreview.bind(this));
        internalBridge.on('brdy-pilot:action:apply', this.handleApply.bind(this));
        internalBridge.on('brdy-pilot:action:undo', this.handleUndo.bind(this));
        internalBridge.on('brdy-pilot:action:redo', this.handleRedo.bind(this));
        
        console.log('[Brdy Pilot] Action Layer initialized');
    }

    /**
     * DOM Fill Action
     * Fills form fields with provided data
     */
    async domFill(fillData) {
        const action = {
            type: 'dom_fill',
            timestamp: Date.now(),
            data: fillData,
            id: this.generateActionId()
        };

        try {
            // Validate fill data
            const validatedData = this.validateFillData(fillData);
            
            // Create undo data before making changes
            const undoData = await this.captureCurrentState(validatedData.selectors);
            
            // Execute the fill operation
            const result = await this.executeDomFill(validatedData);
            
            // Store action for undo
            action.undoData = undoData;
            action.result = result;
            action.success = true;
            
            this.actionHistory.push(action);
            this.undoStack.push(action);
            this.redoStack = []; // Clear redo stack on new action
            
            return {
                success: true,
                data: {
                    actionId: action.id,
                    fieldsUpdated: result.fieldsUpdated,
                    canUndo: true
                }
            };
            
        } catch (error) {
            action.error = error.message;
            action.success = false;
            this.actionHistory.push(action);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    validateFillData(fillData) {
        if (!fillData || !fillData.mappings) {
            throw new Error('Invalid fill data: mappings required');
        }

        const selectors = Object.keys(fillData.mappings);
        if (selectors.length === 0) {
            throw new Error('No field mappings provided');
        }

        return {
            mappings: fillData.mappings,
            selectors: selectors,
            options: fillData.options || {}
        };
    }

    async captureCurrentState(selectors) {
        return new Promise((resolve) => {
            // Send message to content script to capture current values
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'captureState',
                        selectors: selectors
                    }, (response) => {
                        resolve(response || {});
                    });
                } else {
                    resolve({});
                }
            });
        });
    }

    async executeDomFill(fillData) {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) {
                    reject(new Error('No active tab found'));
                    return;
                }

                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'fillFields',
                    data: fillData
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response && response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response?.error || 'Fill operation failed'));
                    }
                });
            });
        });
    }

    /**
     * Email Insert Action
     * Inserts content into email compose areas
     */
    async emailInsert(insertData) {
        const action = {
            type: 'email_insert',
            timestamp: Date.now(),
            data: insertData,
            id: this.generateActionId()
        };

        try {
            // Validate insert data
            const validatedData = this.validateInsertData(insertData);
            
            // Detect email application type
            const appType = await this.detectEmailApp();
            
            // Capture current state for undo
            const undoData = await this.captureEmailState(appType);
            
            // Execute the insert operation
            const result = await this.executeEmailInsert(validatedData, appType);
            
            action.undoData = undoData;
            action.result = result;
            action.success = true;
            
            this.actionHistory.push(action);
            this.undoStack.push(action);
            this.redoStack = [];
            
            return {
                success: true,
                data: {
                    actionId: action.id,
                    position: result.position,
                    length: result.length,
                    canUndo: true
                }
            };
            
        } catch (error) {
            action.error = error.message;
            action.success = false;
            this.actionHistory.push(action);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    validateInsertData(insertData) {
        if (!insertData || !insertData.content) {
            throw new Error('Invalid insert data: content required');
        }

        return {
            content: insertData.content,
            position: insertData.position || 'append', // append, prepend, replace
            target: insertData.target || 'compose', // compose, subject, body
            format: insertData.format || 'text' // text, html
        };
    }

    async detectEmailApp() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    const url = tabs[0].url.toLowerCase();
                    const title = tabs[0].title.toLowerCase();
                    
                    if (url.includes('mail.google.com') || title.includes('gmail')) {
                        resolve('gmail');
                    } else if (url.includes('outlook.') || title.includes('outlook')) {
                        resolve('outlook');
                    } else {
                        resolve('unknown');
                    }
                } else {
                    resolve('unknown');
                }
            });
        });
    }

    async captureEmailState(appType) {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'captureEmailState',
                        appType: appType
                    }, (response) => {
                        resolve(response || {});
                    });
                } else {
                    resolve({});
                }
            });
        });
    }

    async executeEmailInsert(insertData, appType) {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) {
                    reject(new Error('No active tab found'));
                    return;
                }

                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'insertEmail',
                    data: { ...insertData, appType }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response && response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response?.error || 'Insert operation failed'));
                    }
                });
            });
        });
    }

    /**
     * Preview System
     * Shows a preview of changes before applying them
     */
    async preview(previewData) {
        try {
            this.previewMode = true;
            
            const preview = {
                id: this.generateActionId(),
                type: previewData.type,
                changes: previewData.changes,
                timestamp: Date.now()
            };
            
            // Generate visual preview
            const visualPreview = await this.generateVisualPreview(preview);
            
            this.currentPreview = {
                ...preview,
                visual: visualPreview
            };
            
            return {
                success: true,
                data: {
                    previewId: preview.id,
                    changes: preview.changes,
                    visual: visualPreview,
                    canApply: true,
                    estimatedTime: this.estimateExecutionTime(preview.changes)
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async generateVisualPreview(preview) {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'generatePreview',
                        data: preview
                    }, (response) => {
                        resolve(response || {});
                    });
                } else {
                    resolve({});
                }
            });
        });
    }

    estimateExecutionTime(changes) {
        // Estimate time based on number and complexity of changes
        const baseTime = 1; // seconds
        const timePerChange = 0.5;
        return baseTime + (changes.length * timePerChange);
    }

    /**
     * Apply previewed changes
     */
    async apply() {
        if (!this.currentPreview) {
            return {
                success: false,
                error: 'No preview to apply'
            };
        }

        try {
            let result;
            
            if (this.currentPreview.type === 'dom_fill') {
                result = await this.domFill({
                    mappings: this.convertChangesToMappings(this.currentPreview.changes)
                });
            } else if (this.currentPreview.type === 'email_insert') {
                result = await this.emailInsert({
                    content: this.currentPreview.changes[0]?.value,
                    position: this.currentPreview.changes[0]?.position
                });
            }
            
            // Clear preview
            this.previewMode = false;
            this.currentPreview = null;
            
            return result;
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    convertChangesToMappings(changes) {
        const mappings = {};
        changes.forEach(change => {
            mappings[change.selector] = change.value;
        });
        return mappings;
    }

    /**
     * Undo last action
     */
    async undo() {
        if (this.undoStack.length === 0) {
            return {
                success: false,
                error: 'Nothing to undo'
            };
        }

        const lastAction = this.undoStack.pop();
        
        try {
            await this.executeUndo(lastAction);
            
            this.redoStack.push(lastAction);
            
            return {
                success: true,
                data: {
                    undoneAction: lastAction.type,
                    canRedo: true,
                    canUndo: this.undoStack.length > 0
                }
            };
            
        } catch (error) {
            // Restore to undo stack if failed
            this.undoStack.push(lastAction);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    async executeUndo(action) {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) {
                    reject(new Error('No active tab found'));
                    return;
                }

                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'undoAction',
                    data: action.undoData
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response && response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response?.error || 'Undo operation failed'));
                    }
                });
            });
        });
    }

    /**
     * Redo last undone action
     */
    async redo() {
        if (this.redoStack.length === 0) {
            return {
                success: false,
                error: 'Nothing to redo'
            };
        }

        const actionToRedo = this.redoStack.pop();
        
        try {
            let result;
            
            if (actionToRedo.type === 'dom_fill') {
                result = await this.domFill(actionToRedo.data);
            } else if (actionToRedo.type === 'email_insert') {
                result = await this.emailInsert(actionToRedo.data);
            }
            
            return {
                success: true,
                data: {
                    redoneAction: actionToRedo.type,
                    canUndo: true,
                    canRedo: this.redoStack.length > 0
                }
            };
            
        } catch (error) {
            // Restore to redo stack if failed
            this.redoStack.push(actionToRedo);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Event handlers for internal bridge
    async handleDomFill(data) {
        const result = await this.domFill(data);
        internalBridge.emit('brdy-pilot:action:domFill:result', result);
    }

    async handleEmailInsert(data) {
        const result = await this.emailInsert(data);
        internalBridge.emit('brdy-pilot:action:emailInsert:result', result);
    }

    async handlePreview(data) {
        const result = await this.preview(data);
        internalBridge.emit('brdy-pilot:action:preview:result', result);
    }

    async handleApply() {
        const result = await this.apply();
        internalBridge.emit('brdy-pilot:action:apply:result', result);
    }

    async handleUndo() {
        const result = await this.undo();
        internalBridge.emit('brdy-pilot:action:undo:result', result);
    }

    async handleRedo() {
        const result = await this.redo();
        internalBridge.emit('brdy-pilot:action:redo:result', result);
    }

    // Utility methods
    generateActionId() {
        return 'action_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    getActionHistory() {
        return this.actionHistory;
    }

    getUndoStack() {
        return this.undoStack;
    }

    getRedoStack() {
        return this.redoStack;
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    clearHistory() {
        this.actionHistory = [];
        this.undoStack = [];
        this.redoStack = [];
        this.currentPreview = null;
        this.previewMode = false;
    }

    getStatistics() {
        const total = this.actionHistory.length;
        const successful = this.actionHistory.filter(action => action.success).length;
        const byType = this.actionHistory.reduce((acc, action) => {
            acc[action.type] = (acc[action.type] || 0) + 1;
            return acc;
        }, {});

        return {
            totalActions: total,
            successfulActions: successful,
            successRate: total > 0 ? successful / total : 0,
            actionsByType: byType,
            undoStackSize: this.undoStack.length,
            redoStackSize: this.redoStack.length,
            lastAction: this.actionHistory[this.actionHistory.length - 1]?.timestamp
        };
    }
}

const actionLayer = new ActionLayer();

module.exports = actionLayer;