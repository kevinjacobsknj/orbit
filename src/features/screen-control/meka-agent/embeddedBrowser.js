/**
 * Embedded Browser for Orbit Computer Control
 * Provides a controllable browser window that AI can interact with
 */

const { BrowserWindow, webContents } = require('electron');
const path = require('path');

class EmbeddedBrowser {
    constructor() {
        this.browserWindow = null;
        this.isReady = false;
        this.currentUrl = null;
    }

    /**
     * Initialize the embedded browser window
     */
    async initialize() {
        if (this.browserWindow) {
            return; // Already initialized
        }

        this.browserWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            show: true, // Show the window so AI can see it
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true
            },
            title: 'Orbit AI Browser',
            autoHideMenuBar: false
        });

        // Handle browser events
        this.browserWindow.webContents.on('did-finish-load', () => {
            console.log('[EmbeddedBrowser] Page finished loading:', this.currentUrl);
            this.isReady = true;
        });

        this.browserWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
            console.error('[EmbeddedBrowser] Failed to load:', validatedURL, errorDescription);
        });

        this.browserWindow.webContents.on('new-window', (event, navigationUrl) => {
            event.preventDefault();
            console.log('[EmbeddedBrowser] Blocking new window:', navigationUrl);
        });

        // Load a simple start page
        await this.browserWindow.loadURL('data:text/html,<html><body><h1>Orbit AI Browser Ready</h1><p>Waiting for navigation command...</p></body></html>');
        
        console.log('[EmbeddedBrowser] Browser window initialized');
        return this.browserWindow;
    }

    /**
     * Navigate to a specific URL
     */
    async navigateTo(url) {
        if (!this.browserWindow) {
            await this.initialize();
        }

        try {
            console.log(`[EmbeddedBrowser] Navigating to: ${url}`);
            this.isReady = false;
            this.currentUrl = url;
            
            await this.browserWindow.loadURL(url);
            
            // Wait for page to load
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.log('[EmbeddedBrowser] Navigation timeout, proceeding anyway');
                    resolve({ success: true, url, message: 'Navigation completed (timeout)' });
                }, 10000); // 10 second timeout

                const checkReady = () => {
                    if (this.isReady) {
                        clearTimeout(timeout);
                        console.log('[EmbeddedBrowser] Navigation completed successfully');
                        resolve({ success: true, url, message: 'Navigation completed successfully' });
                    } else {
                        setTimeout(checkReady, 100);
                    }
                };
                checkReady();
            });
            
        } catch (error) {
            console.error('[EmbeddedBrowser] Navigation failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get the current URL
     */
    getCurrentUrl() {
        return this.currentUrl || 'about:blank';
    }

    /**
     * Take a screenshot of the browser content
     */
    async takeScreenshot() {
        if (!this.browserWindow) {
            throw new Error('Browser not initialized');
        }

        try {
            const image = await this.browserWindow.capturePage();
            return image.toDataURL();
        } catch (error) {
            console.error('[EmbeddedBrowser] Screenshot failed:', error);
            throw error;
        }
    }

    /**
     * Execute JavaScript in the browser context
     */
    async executeScript(script) {
        if (!this.browserWindow) {
            throw new Error('Browser not initialized');
        }

        try {
            return await this.browserWindow.webContents.executeJavaScript(script);
        } catch (error) {
            console.error('[EmbeddedBrowser] Script execution failed:', error);
            throw error;
        }
    }

    /**
     * Get page content for analysis
     */
    async getPageContent() {
        try {
            const title = await this.executeScript('document.title');
            const url = await this.executeScript('window.location.href');
            const text = await this.executeScript('document.body.innerText');
            
            return {
                title,
                url,
                text: text.substring(0, 5000) // Limit text to avoid overwhelming the AI
            };
        } catch (error) {
            console.error('[EmbeddedBrowser] Failed to get page content:', error);
            return { title: 'Unknown', url: this.getCurrentUrl(), text: 'Could not extract content' };
        }
    }

    /**
     * Click at specific coordinates within the browser
     */
    async clickAt(x, y) {
        if (!this.browserWindow) {
            throw new Error('Browser not initialized');
        }

        try {
            // Convert screen coordinates to browser content coordinates
            const bounds = this.browserWindow.getBounds();
            const contentBounds = this.browserWindow.getContentBounds();
            
            // Adjust coordinates for browser chrome (address bar, etc.)
            const adjustedX = x - bounds.x;
            const adjustedY = y - bounds.y - (bounds.height - contentBounds.height);
            
            console.log(`[EmbeddedBrowser] Clicking at browser coordinates: (${adjustedX}, ${adjustedY})`);
            
            await this.executeScript(`
                const element = document.elementFromPoint(${adjustedX}, ${adjustedY});
                if (element) {
                    element.click();
                    console.log('Clicked element:', element.tagName, element.textContent?.substring(0, 50));
                } else {
                    console.log('No element found at coordinates');
                }
            `);
            
            return { success: true, x: adjustedX, y: adjustedY };
        } catch (error) {
            console.error('[EmbeddedBrowser] Click failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Type text in the currently focused element
     */
    async typeText(text) {
        if (!this.browserWindow) {
            throw new Error('Browser not initialized');
        }

        try {
            await this.executeScript(`
                const activeElement = document.activeElement;
                if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
                    activeElement.value = activeElement.value || '';
                    activeElement.value += '${text.replace(/'/g, "\\'")}';
                    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
                    console.log('Text typed into:', activeElement.tagName);
                } else {
                    console.log('No focusable element found');
                }
            `);
            
            return { success: true, text };
        } catch (error) {
            console.error('[EmbeddedBrowser] Typing failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Scroll the page
     */
    async scroll(direction, amount = 3) {
        if (!this.browserWindow) {
            throw new Error('Browser not initialized');
        }

        try {
            const scrollY = direction === 'down' ? amount * 100 : -amount * 100;
            await this.executeScript(`window.scrollBy(0, ${scrollY})`);
            return { success: true, direction, amount };
        } catch (error) {
            console.error('[EmbeddedBrowser] Scroll failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Close the browser window
     */
    async close() {
        if (this.browserWindow) {
            this.browserWindow.close();
            this.browserWindow = null;
            this.isReady = false;
            this.currentUrl = null;
            console.log('[EmbeddedBrowser] Browser window closed');
        }
    }

    /**
     * Check if browser is ready
     */
    isWindowReady() {
        return this.isReady && this.browserWindow && !this.browserWindow.isDestroyed();
    }

    /**
     * Get browser window bounds for coordinate calculations
     */
    getBounds() {
        if (!this.browserWindow) {
            return { x: 0, y: 0, width: 1200, height: 800 };
        }
        return this.browserWindow.getBounds();
    }
}

module.exports = EmbeddedBrowser;