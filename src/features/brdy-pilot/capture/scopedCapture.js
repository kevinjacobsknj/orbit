/**
 * Brdy Pilot Scoped Capture System
 * Handles selection → focused form block → region OCR with minimal payloads
 */

const internalBridge = require('../../../bridge/internalBridge');

class ScopedCapture {
    constructor() {
        this.captureMode = null;
        this.activeSelection = null;
        this.ocrService = null;
        this.captureHistory = [];
        this.compressionLevel = 0.8; // For keeping payloads tiny
        this.init();
    }

    init() {
        // Listen for capture requests
        internalBridge.on('brdy-pilot:capture:start', this.handleCaptureStart.bind(this));
        internalBridge.on('brdy-pilot:capture:region', this.handleRegionCapture.bind(this));
        internalBridge.on('brdy-pilot:capture:form', this.handleFormCapture.bind(this));
        internalBridge.on('brdy-pilot:capture:ocr', this.handleOCRCapture.bind(this));
        internalBridge.on('brdy-pilot:capture:optimize', this.handleOptimizePayload.bind(this));
        
        // Initialize OCR service
        this.initializeOCR();
        
        console.log('[Brdy Pilot] Scoped Capture initialized');
    }

    async initializeOCR() {
        try {
            // Initialize Tesseract.js for OCR functionality
            // This would be loaded as a web worker for performance
            this.ocrService = {
                ready: true,
                recognize: this.mockOCRRecognize.bind(this) // Placeholder for now
            };
            console.log('[Brdy Pilot] OCR service initialized');
        } catch (error) {
            console.error('[Brdy Pilot] Failed to initialize OCR:', error);
            this.ocrService = null;
        }
    }

    /**
     * Start capture process with progressive scoping
     * 1. Selection → 2. Focused form block → 3. Region OCR
     */
    async startCapture(options = {}) {
        const captureSession = {
            id: this.generateCaptureId(),
            timestamp: Date.now(),
            mode: options.mode || 'progressive', // progressive, direct, form-only
            scope: options.scope || 'auto', // auto, selection, form, region
            options: options
        };

        try {
            // Phase 1: Enable selection mode
            await this.enableSelectionMode(captureSession);
            
            return {
                success: true,
                data: {
                    sessionId: captureSession.id,
                    mode: captureSession.mode,
                    instructions: this.getSelectionInstructions(captureSession.mode)
                }
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async enableSelectionMode(session) {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) {
                    reject(new Error('No active tab found'));
                    return;
                }

                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'enableSelectionMode',
                    data: {
                        sessionId: session.id,
                        mode: session.mode,
                        instructions: this.getSelectionInstructions(session.mode)
                    }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });
        });
    }

    getSelectionInstructions(mode) {
        const instructions = {
            progressive: 'Click on any element to start smart capture. I\'ll analyze the context and suggest the best capture scope.',
            direct: 'Select the specific region you want to capture for OCR processing.',
            'form-only': 'Click on a form to analyze its structure and fields for automation.'
        };
        
        return instructions[mode] || instructions.progressive;
    }

    /**
     * Handle region-based capture with intelligent scoping
     */
    async captureRegion(regionData) {
        const capture = {
            id: this.generateCaptureId(),
            type: 'region',
            timestamp: Date.now(),
            region: regionData.region,
            element: regionData.element
        };

        try {
            // Step 1: Analyze the selected element context
            const context = await this.analyzeElementContext(regionData.element);
            
            // Step 2: Determine optimal capture scope
            const scope = this.determineOptimalScope(context, regionData.region);
            
            // Step 3: Capture with optimized boundaries
            const screenshot = await this.captureOptimizedRegion(scope);
            
            // Step 4: Compress and optimize payload
            const optimizedData = await this.optimizePayload(screenshot, scope);
            
            // Step 5: Process with OCR if needed
            let ocrResult = null;
            if (scope.needsOCR) {
                ocrResult = await this.processOCR(optimizedData);
            }
            
            capture.result = {
                scope,
                screenshot: optimizedData,
                ocr: ocrResult,
                payloadSize: this.calculatePayloadSize(optimizedData)
            };
            
            this.captureHistory.push(capture);
            
            return {
                success: true,
                data: capture.result
            };
            
        } catch (error) {
            capture.error = error.message;
            this.captureHistory.push(capture);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    async analyzeElementContext(elementData) {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'analyzeContext',
                        data: elementData
                    }, (response) => {
                        resolve(response || {});
                    });
                } else {
                    resolve({});
                }
            });
        });
    }

    determineOptimalScope(context, originalRegion) {
        // Smart scoping algorithm
        const scope = {
            type: 'element', // element, form, container, viewport
            boundaries: originalRegion,
            needsOCR: false,
            confidence: 0.5,
            reason: 'default'
        };

        // If element is part of a form, expand to form boundaries
        if (context.isFormElement) {
            scope.type = 'form';
            scope.boundaries = context.formBoundaries;
            scope.needsOCR = context.hasTextContent;
            scope.confidence = 0.8;
            scope.reason = 'form_context_detected';
        }
        
        // If element contains significant text, enable OCR
        else if (context.hasSignificantText) {
            scope.needsOCR = true;
            scope.confidence = 0.7;
            scope.reason = 'text_content_detected';
        }
        
        // If element is a container with multiple interactive elements
        else if (context.isContainer && context.childElements > 3) {
            scope.type = 'container';
            scope.boundaries = context.containerBoundaries;
            scope.confidence = 0.6;
            scope.reason = 'container_context';
        }

        // Ensure boundaries don't exceed viewport and are reasonable
        scope.boundaries = this.validateBoundaries(scope.boundaries);
        
        return scope;
    }

    validateBoundaries(boundaries) {
        // Ensure minimum size
        const minWidth = 50;
        const minHeight = 50;
        
        // Ensure maximum size (to keep payloads small)
        const maxWidth = 1200;
        const maxHeight = 800;
        
        return {
            x: Math.max(0, boundaries.x),
            y: Math.max(0, boundaries.y),
            width: Math.min(maxWidth, Math.max(minWidth, boundaries.width)),
            height: Math.min(maxHeight, Math.max(minHeight, boundaries.height))
        };
    }

    async captureOptimizedRegion(scope) {
        return new Promise((resolve, reject) => {
            chrome.tabs.captureVisibleTab(null, {
                format: 'png',
                quality: 90
            }, (dataUrl) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    // Crop to the specific region
                    this.cropImage(dataUrl, scope.boundaries)
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    }

    async cropImage(dataUrl, boundaries) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                canvas.width = boundaries.width;
                canvas.height = boundaries.height;
                
                // Calculate device pixel ratio for high-DPI screens
                const dpr = window.devicePixelRatio || 1;
                
                ctx.drawImage(
                    img,
                    boundaries.x * dpr,
                    boundaries.y * dpr,
                    boundaries.width * dpr,
                    boundaries.height * dpr,
                    0,
                    0,
                    boundaries.width,
                    boundaries.height
                );
                
                resolve(canvas.toDataURL('image/png', this.compressionLevel));
            };
            
            img.src = dataUrl;
        });
    }

    async optimizePayload(imageData, scope) {
        // Apply compression and optimization strategies
        const optimizations = {
            original: imageData,
            compressed: null,
            webp: null,
            resized: null
        };

        try {
            // Try WebP compression for better file size
            optimizations.webp = await this.convertToWebP(imageData);
            
            // Resize if image is too large
            if (scope.boundaries.width > 600 || scope.boundaries.height > 600) {
                optimizations.resized = await this.resizeImage(imageData, 0.5);
            }
            
            // Choose the best optimization
            const best = this.selectBestOptimization(optimizations);
            
            return {
                data: best.data,
                format: best.format,
                originalSize: this.getImageSize(imageData),
                optimizedSize: this.getImageSize(best.data),
                compressionRatio: this.calculateCompressionRatio(imageData, best.data)
            };
            
        } catch (error) {
            // Fallback to original if optimization fails
            return {
                data: imageData,
                format: 'png',
                originalSize: this.getImageSize(imageData),
                optimizedSize: this.getImageSize(imageData),
                compressionRatio: 1.0
            };
        }
    }

    async convertToWebP(imageData) {
        // WebP conversion for better compression
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                
                try {
                    const webpData = canvas.toDataURL('image/webp', 0.8);
                    resolve(webpData);
                } catch (error) {
                    resolve(imageData); // Fallback to original
                }
            };
            
            img.src = imageData;
        });
    }

    async resizeImage(imageData, scale) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                resolve(canvas.toDataURL('image/png', this.compressionLevel));
            };
            
            img.src = imageData;
        });
    }

    selectBestOptimization(optimizations) {
        const candidates = [
            { data: optimizations.original, format: 'png' },
            { data: optimizations.webp, format: 'webp' },
            { data: optimizations.resized, format: 'png' }
        ].filter(opt => opt.data);

        // Select the one with the smallest size
        return candidates.reduce((best, current) => {
            const currentSize = this.getImageSize(current.data);
            const bestSize = this.getImageSize(best.data);
            return currentSize < bestSize ? current : best;
        });
    }

    getImageSize(dataUrl) {
        // Estimate size from data URL
        if (!dataUrl) return 0;
        
        const base64 = dataUrl.split(',')[1];
        return base64 ? (base64.length * 3) / 4 : 0;
    }

    calculateCompressionRatio(original, optimized) {
        const originalSize = this.getImageSize(original);
        const optimizedSize = this.getImageSize(optimized);
        
        return originalSize > 0 ? optimizedSize / originalSize : 1.0;
    }

    /**
     * OCR Processing with optimization for small payloads
     */
    async processOCR(optimizedData) {
        if (!this.ocrService || !this.ocrService.ready) {
            return {
                success: false,
                error: 'OCR service not available'
            };
        }

        try {
            const ocrResult = await this.ocrService.recognize(optimizedData.data);
            
            return {
                success: true,
                text: ocrResult.text,
                confidence: ocrResult.confidence,
                words: ocrResult.words,
                blocks: ocrResult.blocks,
                processingTime: ocrResult.processingTime
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async mockOCRRecognize(imageData) {
        // Mock OCR function for development
        // In production, this would use Tesseract.js or similar
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    text: 'Sample OCR text extracted from image',
                    confidence: 0.85,
                    words: [
                        { text: 'Sample', confidence: 0.9 },
                        { text: 'OCR', confidence: 0.8 },
                        { text: 'text', confidence: 0.9 }
                    ],
                    blocks: [
                        { text: 'Sample OCR text extracted from image', confidence: 0.85 }
                    ],
                    processingTime: 1500
                });
            }, 1000);
        });
    }

    /**
     * Form-focused capture
     */
    async captureForm(formData) {
        const capture = {
            id: this.generateCaptureId(),
            type: 'form',
            timestamp: Date.now(),
            form: formData
        };

        try {
            // Analyze form structure
            const formAnalysis = await this.analyzeFormStructure(formData);
            
            // Capture form region with context
            const formRegion = await this.calculateFormBoundaries(formData, formAnalysis);
            
            // Capture with minimal payload
            const screenshot = await this.captureOptimizedRegion({
                boundaries: formRegion,
                needsOCR: formAnalysis.hasLabels
            });
            
            // Extract form field information
            const fieldData = this.extractFormFieldData(formData, formAnalysis);
            
            capture.result = {
                formAnalysis,
                screenshot,
                fieldData,
                boundaries: formRegion
            };
            
            this.captureHistory.push(capture);
            
            return {
                success: true,
                data: capture.result
            };
            
        } catch (error) {
            capture.error = error.message;
            this.captureHistory.push(capture);
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    async analyzeFormStructure(formData) {
        return {
            fieldCount: formData.fields?.length || 0,
            hasLabels: formData.fields?.some(f => f.label) || false,
            hasValidation: formData.fields?.some(f => f.required) || false,
            isMultiStep: false, // Could be enhanced
            complexity: this.assessFormComplexity(formData)
        };
    }

    assessFormComplexity(formData) {
        const fieldCount = formData.fields?.length || 0;
        
        if (fieldCount <= 3) return 'simple';
        if (fieldCount <= 8) return 'medium';
        return 'complex';
    }

    async calculateFormBoundaries(formData, analysis) {
        // Calculate optimal boundaries that include all form fields plus context
        const fields = formData.fields || [];
        
        if (fields.length === 0) {
            return { x: 0, y: 0, width: 400, height: 300 };
        }

        const rects = fields.map(f => f.rect).filter(r => r);
        
        if (rects.length === 0) {
            return { x: 0, y: 0, width: 400, height: 300 };
        }

        const minX = Math.min(...rects.map(r => r.x)) - 20;
        const minY = Math.min(...rects.map(r => r.y)) - 20;
        const maxX = Math.max(...rects.map(r => r.x + r.width)) + 20;
        const maxY = Math.max(...rects.map(r => r.y + r.height)) + 20;

        return {
            x: Math.max(0, minX),
            y: Math.max(0, minY),
            width: maxX - minX,
            height: maxY - minY
        };
    }

    extractFormFieldData(formData, analysis) {
        return {
            fields: formData.fields?.map(field => ({
                name: field.name,
                type: field.type,
                id: field.id,
                placeholder: field.placeholder,
                required: field.required,
                selector: field.selector
            })) || [],
            metadata: {
                action: formData.action,
                method: formData.method,
                complexity: analysis.complexity
            }
        };
    }

    // Event handlers for internal bridge
    async handleCaptureStart(data) {
        const result = await this.startCapture(data);
        internalBridge.emit('brdy-pilot:capture:start:result', result);
    }

    async handleRegionCapture(data) {
        const result = await this.captureRegion(data);
        internalBridge.emit('brdy-pilot:capture:region:result', result);
    }

    async handleFormCapture(data) {
        const result = await this.captureForm(data);
        internalBridge.emit('brdy-pilot:capture:form:result', result);
    }

    async handleOCRCapture(data) {
        const result = await this.processOCR(data);
        internalBridge.emit('brdy-pilot:capture:ocr:result', result);
    }

    async handleOptimizePayload(data) {
        const result = await this.optimizePayload(data.image, data.scope);
        internalBridge.emit('brdy-pilot:capture:optimize:result', result);
    }

    // Utility methods
    generateCaptureId() {
        return 'capture_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    calculatePayloadSize(data) {
        if (data && data.data) {
            return this.getImageSize(data.data);
        }
        return 0;
    }

    getCaptureHistory() {
        return this.captureHistory;
    }

    clearHistory() {
        this.captureHistory = [];
    }

    getStatistics() {
        const total = this.captureHistory.length;
        const successful = this.captureHistory.filter(c => !c.error).length;
        const byType = this.captureHistory.reduce((acc, capture) => {
            acc[capture.type] = (acc[capture.type] || 0) + 1;
            return acc;
        }, {});

        const totalSize = this.captureHistory.reduce((sum, capture) => {
            return sum + (capture.result?.payloadSize || 0);
        }, 0);

        return {
            totalCaptures: total,
            successfulCaptures: successful,
            successRate: total > 0 ? successful / total : 0,
            capturesByType: byType,
            totalPayloadSize: totalSize,
            averagePayloadSize: total > 0 ? totalSize / total : 0,
            lastCapture: this.captureHistory[this.captureHistory.length - 1]?.timestamp
        };
    }
}

const scopedCapture = new ScopedCapture();

module.exports = scopedCapture;