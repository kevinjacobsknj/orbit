/**
 * Screen Capture for Computer Vision
 * Enables Orbit to "see" the screen like ChatGPT Agent
 */

// Check if Electron is available
let screen, nativeImage, desktopCapturer;
try {
    if (process.versions.electron) {
        ({ screen, nativeImage, desktopCapturer } = require('electron'));
    }
} catch (error) {
    console.warn('[ScreenCapture] Electron APIs not available:', error.message);
}

const fs = require('fs').promises;
const path = require('path');

class ScreenCapture {
    constructor() {
        this.lastCapture = null;
        this.captureHistory = [];
    }

    /**
     * Capture entire screen or specific area
     */
    async captureScreen(options = {}) {
        try {
            const {
                display = null,
                region = null, // {x, y, width, height}
                format = 'png',
                quality = 1.0
            } = options;

            // Check if Electron APIs are available
            if (!screen || !desktopCapturer || !nativeImage) {
                throw new Error('Screen capture requires Electron environment. Please run this within the Orbit app.');
            }

            // Get all displays
            const displays = screen.getAllDisplays();
            const targetDisplay = display || displays.find(d => d.bounds.x === 0 && d.bounds.y === 0) || displays[0];

            console.log('[ScreenCapture] Capturing screen:', targetDisplay.bounds);

            // Capture screenshot using desktopCapturer
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: {
                    width: Math.min(targetDisplay.bounds.width, 1920),
                    height: Math.min(targetDisplay.bounds.height, 1080)
                }
            });

            if (!sources || sources.length === 0) {
                throw new Error('No screen sources available');
            }

            // Get the primary screen source
            const primarySource = sources.find(source => 
                source.name.toLowerCase().includes('screen 1') || 
                source.name.toLowerCase().includes('entire screen')
            ) || sources[0];

            const image = primarySource.thumbnail;

            // Convert to buffer
            const buffer = region ? 
                this.cropImage(image, region) : 
                image.toPNG();

            // Store capture info
            const captureData = {
                timestamp: Date.now(),
                display: targetDisplay,
                region: region,
                size: buffer.length,
                buffer: buffer
            };

            this.lastCapture = captureData;
            this.captureHistory.push({
                timestamp: captureData.timestamp,
                size: captureData.size
            });

            // Keep only last 10 captures in history
            if (this.captureHistory.length > 10) {
                this.captureHistory.shift();
            }

            console.log('[ScreenCapture] ✅ Screen captured:', buffer.length, 'bytes');
            return captureData;

        } catch (error) {
            console.error('[ScreenCapture] Failed to capture screen:', error);
            throw error;
        }
    }

    /**
     * Capture specific window
     */
    async captureWindow(windowName) {
        try {
            // This would integrate with system APIs to capture specific windows
            // For now, fall back to full screen capture
            console.log('[ScreenCapture] Capturing window:', windowName);
            return await this.captureScreen();
        } catch (error) {
            console.error('[ScreenCapture] Failed to capture window:', error);
            throw error;
        }
    }

    /**
     * Save capture to file
     */
    async saveCapture(captureData, filePath) {
        try {
            await fs.writeFile(filePath, captureData.buffer);
            console.log('[ScreenCapture] Saved to:', filePath);
            return filePath;
        } catch (error) {
            console.error('[ScreenCapture] Failed to save:', error);
            throw error;
        }
    }

    /**
     * Get base64 encoded image for AI analysis
     */
    getBase64(captureData) {
        return captureData.buffer.toString('base64');
    }

    /**
     * Crop image to specific region
     */
    cropImage(image, region) {
        try {
            const cropped = image.crop(region);
            return cropped.toPNG();
        } catch (error) {
            console.error('[ScreenCapture] Failed to crop image:', error);
            return image.toPNG();
        }
    }

    /**
     * Find elements on screen using template matching
     */
    async findElement(templatePath, options = {}) {
        try {
            const {
                threshold = 0.8,
                region = null
            } = options;

            // This would implement template matching
            // For now, return mock coordinates
            console.log('[ScreenCapture] Finding element:', templatePath);
            
            // TODO: Implement actual template matching
            return {
                found: false,
                confidence: 0,
                location: null
            };
        } catch (error) {
            console.error('[ScreenCapture] Failed to find element:', error);
            return { found: false };
        }
    }

    /**
     * Get screen dimensions
     */
    getScreenDimensions() {
        const primaryDisplay = screen.getPrimaryDisplay();
        return {
            width: primaryDisplay.bounds.width,
            height: primaryDisplay.bounds.height,
            scaleFactor: primaryDisplay.scaleFactor
        };
    }

    /**
     * Monitor screen changes
     */
    startMonitoring(callback, interval = 1000) {
        console.log('[ScreenCapture] Starting screen monitoring');
        
        this.monitoringInterval = setInterval(async () => {
            try {
                const capture = await this.captureScreen();
                if (callback) {
                    callback(capture);
                }
            } catch (error) {
                console.error('[ScreenCapture] Monitoring error:', error);
            }
        }, interval);

        return this.monitoringInterval;
    }

    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            console.log('[ScreenCapture] Stopped screen monitoring');
        }
    }
}

module.exports = new ScreenCapture();