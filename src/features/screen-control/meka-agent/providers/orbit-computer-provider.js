/**
 * Orbit Computer Provider for Meka Agent
 * Adapts Orbit's screen control capabilities to Meka's ComputerProvider interface
 */

const mouseControl = require('../../mouseControl');
const screenCapture = require('../../screenCapture');
const EmbeddedBrowser = require('../embeddedBrowser');

class OrbitComputerProvider {
    constructor() {
        this.sessions = new Map();
        this.embeddedBrowser = new EmbeddedBrowser();
    }

    /**
     * Returns the current URL of the environment
     */
    async getCurrentUrl(sessionId) {
        try {
            return this.embeddedBrowser.getCurrentUrl();
        } catch (error) {
            console.warn('[OrbitComputerProvider] Could not get current URL:', error.message);
            return "about:blank";
        }
    }

    /**
     * Takes a screenshot of the environment
     */
    async takeScreenshot(sessionId) {
        try {
            // First try to get browser screenshot if available
            if (this.embeddedBrowser && this.embeddedBrowser.isWindowReady()) {
                const browserScreenshot = await this.embeddedBrowser.takeScreenshot();
                if (browserScreenshot) {
                    return browserScreenshot.replace('data:image/png;base64,', '');
                }
            }
            
            // Fallback to general screen capture
            const capture = await screenCapture.captureScreen();
            return screenCapture.getBase64(capture);
        } catch (error) {
            console.warn(`[OrbitComputerProvider] Screenshot failed: ${error.message}`);
            
            // Return a placeholder screenshot with instructions instead of failing
            const placeholderImage = this.createPlaceholderScreenshot(sessionId);
            return placeholderImage;
        }
    }
    
    /**
     * Creates a placeholder screenshot when real capture fails
     */
    createPlaceholderScreenshot(sessionId) {
        // Create a simple base64 encoded text image indicating screenshot unavailable
        const placeholderText = `SCREENSHOT NOT AVAILABLE - ELECTRON ENVIRONMENT REQUIRED
Session: ${sessionId}
IMPORTANT: Browser navigation commands are being executed via system 'open' command
Visual confirmation of page content is not possible
DO NOT HALLUCINATE OR INVENT ARTICLE CONTENT - Use complete_task to inform user of limitation`;
        
        // Return a simple base64 representation 
        // In a real implementation, this could be a small image or formatted text
        return Buffer.from(placeholderText).toString('base64');
    }

    /**
     * Returns the instance of the computer provider
     */
    async getInstance(sessionId) {
        return this.sessions.get(sessionId) || {};
    }

    /**
     * Navigates to a certain URL
     */
    async navigateTo(args) {
        const { sessionId, url } = args;
        console.log(`[OrbitComputerProvider] Navigate to ${url} for session ${sessionId}`);
        
        try {
            // Use the embedded browser for controlled navigation
            const result = await this.embeddedBrowser.navigateTo(url);
            
            if (result.success) {
                console.log(`[OrbitComputerProvider] Successfully navigated to ${url} in embedded browser`);
                
                // Get page content for verification
                const pageContent = await this.embeddedBrowser.getPageContent();
                console.log(`[OrbitComputerProvider] Page loaded - Title: "${pageContent.title}"`);
                
                return {
                    success: true,
                    url: result.url,
                    message: `Successfully navigated to ${pageContent.title}`,
                    pageContent
                };
            } else {
                console.error(`[OrbitComputerProvider] Navigation failed:`, result.error);
                return {
                    success: false,
                    error: result.error
                };
            }
            
        } catch (error) {
            console.error(`[OrbitComputerProvider] Navigation error:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Executes a standard computer action
     */
    async performAction(action, context) {
        const { reasoning, sessionId, step } = context;
        
        console.log(`[OrbitComputerProvider] Performing action: ${action.type}`, action);
        
        try {
            let result = { success: false };
            
            switch (action.type) {
                case 'click':
                    // First try to click within the embedded browser
                    if (this.embeddedBrowser && this.embeddedBrowser.isWindowReady()) {
                        const browserBounds = this.embeddedBrowser.getBounds();
                        // Check if click coordinates are within browser window
                        if (action.x >= browserBounds.x && action.x <= browserBounds.x + browserBounds.width &&
                            action.y >= browserBounds.y && action.y <= browserBounds.y + browserBounds.height) {
                            result = await this.embeddedBrowser.clickAt(action.x, action.y);
                            break;
                        }
                    }
                    // Fallback to system mouse control
                    result = await mouseControl.click(action.x, action.y, {
                        button: action.button || 'left'
                    });
                    break;
                    
                case 'double_click':
                    result = await mouseControl.click(action.x, action.y, {
                        doubleClick: true
                    });
                    break;
                    
                case 'type':
                    if (action.text && action.text.trim()) {
                        // First try to type in the embedded browser if it's active
                        if (this.embeddedBrowser && this.embeddedBrowser.isWindowReady()) {
                            try {
                                result = await this.embeddedBrowser.typeText(action.text);
                                if (result.success) break;
                            } catch (error) {
                                console.log('[OrbitComputerProvider] Browser typing failed, falling back to system');
                            }
                        }
                        // Fallback to system typing
                        result = await mouseControl.type(action.text);
                    }
                    break;
                    
                case 'keypress':
                    if (action.keys && action.keys.length > 0) {
                        result = await mouseControl.keyPress(action.keys);
                    }
                    break;
                    
                case 'scroll':
                    // First try to scroll in the embedded browser
                    if (this.embeddedBrowser && this.embeddedBrowser.isWindowReady()) {
                        try {
                            const direction = (action.scroll_y || 0) > 0 ? 'down' : 'up';
                            const amount = Math.abs(action.scroll_y || action.scroll_x || 3);
                            result = await this.embeddedBrowser.scroll(direction, amount);
                            if (result.success) break;
                        } catch (error) {
                            console.log('[OrbitComputerProvider] Browser scrolling failed, falling back to system');
                        }
                    }
                    // Fallback to system scrolling
                    if (action.x !== undefined && action.y !== undefined) {
                        // Handle both scroll_x/scroll_y and direction/amount formats
                        if (action.scroll_y !== undefined || action.scroll_x !== undefined) {
                            const direction = (action.scroll_y || 0) > 0 ? 'down' : 'up';
                            const amount = Math.abs(action.scroll_y || action.scroll_x || 3);
                            result = await mouseControl.scroll(action.x, action.y, direction, amount);
                        }
                    }
                    break;
                    
                case 'drag':
                    if (action.path && Array.isArray(action.path) && action.path.length >= 2) {
                        const start = action.path[0];
                        const end = action.path[action.path.length - 1];
                        result = await mouseControl.drag(start.x, start.y, end.x, end.y);
                    }
                    break;
                    
                case 'screenshot':
                    // Screenshot is automatically taken after each action, so this is just a no-op
                    // But we acknowledge the request
                    result = { success: true, message: 'Screenshot will be taken automatically' };
                    break;
                    
                case 'move':
                    // Just log the move for now
                    console.log(`[OrbitComputerProvider] Moving cursor to (${action.x}, ${action.y})`);
                    result = { success: true };
                    break;
                    
                case 'wait':
                    const duration = action.duration || 1;
                    await new Promise(resolve => setTimeout(resolve, duration * 1000));
                    result = { success: true };
                    break;
                    
                default:
                    console.warn(`[OrbitComputerProvider] Unknown action type: ${action.type}`);
                    result = { success: false, error: 'Unknown action type' };
            }
            
            return {
                type: action.type,
                actionPerformed: `${action.type} action executed${result.success ? ' successfully' : ' with errors'}`,
                reasoning: reasoning || `Performed ${action.type} action`,
                timestamp: new Date().toISOString(),
            };
            
        } catch (error) {
            console.error(`[OrbitComputerProvider] Action failed:`, error);
            return {
                type: action.type,
                actionPerformed: `${action.type} action failed: ${error.message}`,
                reasoning: reasoning || `Failed to perform ${action.type} action`,
                timestamp: new Date().toISOString(),
            };
        }
    }

    /**
     * Starts a new session
     */
    async start(sessionId, options) {
        console.log(`[OrbitComputerProvider] Starting session ${sessionId}`);
        
        // Initialize the embedded browser for this session
        await this.embeddedBrowser.initialize();
        
        this.sessions.set(sessionId, {
            id: sessionId,
            startTime: Date.now(),
            options: options || {},
            browserReady: true
        });
        
        return {
            computerProviderId: sessionId,
            liveUrl: this.embeddedBrowser.getCurrentUrl()
        };
    }

    /**
     * Stops the session
     */
    async stop(sessionId) {
        console.log(`[OrbitComputerProvider] Stopping session ${sessionId}`);
        this.sessions.delete(sessionId);
        
        // Close the embedded browser if no more sessions
        if (this.sessions.size === 0) {
            await this.embeddedBrowser.close();
        }
    }

    /**
     * Returns the screen size of the environment
     */
    async screenSize() {
        // Return default screen size - this could be made dynamic
        return {
            width: 1440,
            height: 900
        };
    }

    /**
     * Optional: Upload screenshot (not implemented for Orbit)
     */
    uploadScreenshot = undefined;

    /**
     * Optional: Restore session (not implemented for Orbit)
     */
    restoreSession = undefined;
}

module.exports = OrbitComputerProvider;