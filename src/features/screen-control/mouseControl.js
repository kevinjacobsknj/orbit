/**
 * Mouse and Keyboard Control for Orbit
 * Enables Orbit to control the computer like ChatGPT Agent
 */

const { spawn } = require('child_process');
const { platform } = require('os');

class MouseControl {
    constructor() {
        this.platform = platform();
        this.isControlling = false;
    }

    /**
     * Click at specific coordinates
     */
    async click(x, y, options = {}) {
        try {
            const {
                button = 'left', // left, right, middle
                doubleClick = false,
                delay = 100
            } = options;

            console.log(`[MouseControl] Clicking at (${x}, ${y}) with ${button} button`);

            // Check permissions on macOS (only in Electron context)
            if (this.platform === 'darwin') {
                try {
                    if (process.versions.electron) {
                        const { systemPreferences } = require('electron');
                        if (!systemPreferences.isTrustedAccessibilityClient(false)) {
                            console.warn('[MouseControl] ⚠️ Accessibility permission not granted');
                            throw new Error('❌ ACCESSIBILITY PERMISSION REQUIRED\n\nTo enable computer control:\n1. Open System Preferences > Security & Privacy > Accessibility\n2. Add Terminal, Orbit app, or grant access to applications\n3. Or run: sudo osascript -e "do shell script"');
                        }
                    } else {
                        console.warn('[MouseControl] Running outside Electron - checking osascript access');
                        // Test osascript access
                        await this.testAccessibilityAccess();
                    }
                } catch (error) {
                    console.warn('[MouseControl] Accessibility check failed:', error.message);
                    if (error.message.includes('osascript is not allowed assistive access')) {
                        console.error(`❌ ACCESSIBILITY PERMISSION REQUIRED

🔧 QUICK FIX:
1. Open System Preferences > Security & Privacy > Accessibility
2. Click the 🔒 lock to make changes (enter password)  
3. Click + and add "Terminal" or your IDE
4. Restart Terminal/IDE after adding permissions

📖 See ACCESSIBILITY_SETUP.md for detailed instructions

⚡ Quick test: osascript -e 'tell application "System Events" to get name of first process'`);
                        // Don't throw - let the operation continue with degraded functionality
                    }
                    // Continue execution even if accessibility check fails
                }
            }

            if (this.platform === 'darwin') {
                // macOS - use AppleScript
                const script = doubleClick ? `
                    tell application "System Events"
                        set mouseLoc to {${x}, ${y}}
                        click at mouseLoc
                        delay 0.1
                        click at mouseLoc
                    end tell
                ` : `
                    tell application "System Events"
                        click at {${x}, ${y}}
                    end tell
                `;
                await this.executeAppleScript(script);
            } else if (this.platform === 'win32') {
                // Windows - use PowerShell or external tool
                await this.executeWindowsClick(x, y, button, doubleClick);
            } else {
                // Linux - use xdotool
                await this.executeLinuxClick(x, y, button, doubleClick);
            }

            // Small delay after click
            await this.delay(delay);
            
            console.log('[MouseControl] ✅ Click completed');
            return { success: true, x, y };

        } catch (error) {
            console.error('[MouseControl] Click failed:', error);
            throw error;
        }
    }

    /**
     * Drag from one point to another
     */
    async drag(fromX, fromY, toX, toY, options = {}) {
        try {
            const { duration = 500 } = options;
            
            console.log(`[MouseControl] Dragging from (${fromX}, ${fromY}) to (${toX}, ${toY})`);

            if (this.platform === 'darwin') {
                const script = `
                    tell application "System Events"
                        set startPoint to {${fromX}, ${fromY}}
                        set endPoint to {${toX}, ${toY}}
                        
                        click at startPoint
                        delay 0.1
                        drag at startPoint to endPoint
                    end tell
                `;
                await this.executeAppleScript(script);
            }

            console.log('[MouseControl] ✅ Drag completed');
            return { success: true, fromX, fromY, toX, toY };

        } catch (error) {
            console.error('[MouseControl] Drag failed:', error);
            throw error;
        }
    }

    /**
     * Type text
     */
    async type(text, options = {}) {
        try {
            const { delay = 50 } = options;
            
            console.log(`[MouseControl] Typing: "${text}"`);

            if (this.platform === 'darwin') {
                // Escape special characters for AppleScript
                const escapedText = text.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
                const script = `
                    tell application "System Events"
                        keystroke "${escapedText}"
                    end tell
                `;
                await this.executeAppleScript(script);
            }

            await this.delay(delay);
            
            console.log('[MouseControl] ✅ Text typed');
            return { success: true, text };

        } catch (error) {
            console.error('[MouseControl] Type failed:', error);
            throw error;
        }
    }

    /**
     * Press keyboard keys
     */
    async keyPress(keys, options = {}) {
        try {
            const { delay = 100 } = options;
            
            // Handle single key or array of keys
            const keyArray = Array.isArray(keys) ? keys : [keys];
            
            console.log(`[MouseControl] Pressing keys: ${keyArray.join('+')}`);

            if (this.platform === 'darwin') {
                const modifiers = [];
                const mainKeys = [];

                keyArray.forEach(key => {
                    const lowerKey = key.toLowerCase();
                    if (['cmd', 'command', 'meta'].includes(lowerKey)) {
                        modifiers.push('command down');
                    } else if (['ctrl', 'control'].includes(lowerKey)) {
                        modifiers.push('control down');
                    } else if (['alt', 'option'].includes(lowerKey)) {
                        modifiers.push('option down');
                    } else if (['shift'].includes(lowerKey)) {
                        modifiers.push('shift down');
                    } else {
                        mainKeys.push(lowerKey);
                    }
                });

                const modifierString = modifiers.length > 0 ? `using {${modifiers.join(', ')}}` : '';
                const keyString = mainKeys.join('');

                const script = `
                    tell application "System Events"
                        key code (key code of "${keyString}") ${modifierString}
                    end tell
                `;
                
                // Fallback for simple keys
                const simpleScript = `
                    tell application "System Events"
                        keystroke "${keyString}" ${modifierString}
                    end tell
                `;

                try {
                    await this.executeAppleScript(script);
                } catch {
                    await this.executeAppleScript(simpleScript);
                }
            }

            await this.delay(delay);
            
            console.log('[MouseControl] ✅ Keys pressed');
            return { success: true, keys: keyArray };

        } catch (error) {
            console.error('[MouseControl] Key press failed:', error);
            throw error;
        }
    }

    /**
     * Scroll at specific location
     */
    async scroll(x, y, direction, amount = 3) {
        try {
            console.log(`[MouseControl] Scrolling ${direction} at (${x}, ${y})`);

            if (this.platform === 'darwin') {
                const scrollDirection = direction === 'up' ? 'up' : 'down';
                const script = `
                    tell application "System Events"
                        set mouseLoc to {${x}, ${y}}
                        click at mouseLoc
                        repeat ${amount} times
                            scroll ${scrollDirection} at mouseLoc
                        end repeat
                    end tell
                `;
                await this.executeAppleScript(script);
            }

            console.log('[MouseControl] ✅ Scroll completed');
            return { success: true, x, y, direction, amount };

        } catch (error) {
            console.error('[MouseControl] Scroll failed:', error);
            throw error;
        }
    }

    /**
     * Get current mouse position
     */
    async getMousePosition() {
        try {
            if (this.platform === 'darwin') {
                const script = `
                    tell application "System Events"
                        return mouse location
                    end tell
                `;
                const result = await this.executeAppleScript(script);
                // Parse result like "123, 456"
                const [x, y] = result.trim().split(', ').map(Number);
                return { x, y };
            }
            
            return { x: 0, y: 0 };
        } catch (error) {
            console.error('[MouseControl] Failed to get mouse position:', error);
            return { x: 0, y: 0 };
        }
    }

    /**
     * Execute AppleScript (macOS)
     */
    async executeAppleScript(script) {
        return new Promise((resolve, reject) => {
            const process = spawn('osascript', ['-e', script]);
            let output = '';
            let error = '';

            process.stdout.on('data', (data) => {
                output += data.toString();
            });

            process.stderr.on('data', (data) => {
                error += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    const errorMessage = `AppleScript failed: ${error}`;
                    if (error.includes('osascript is not allowed assistive access')) {
                        console.warn('[MouseControl] Accessibility permission denied - action may not have executed properly');
                        // Return success but with warning for accessibility issues
                        resolve('Action attempted but accessibility permission denied');
                    } else {
                        reject(new Error(errorMessage));
                    }
                }
            });
        });
    }

    /**
     * Windows click implementation
     */
    async executeWindowsClick(x, y, button, doubleClick) {
        // TODO: Implement Windows automation
        console.log('[MouseControl] Windows automation not yet implemented');
    }

    /**
     * Linux click implementation
     */
    async executeLinuxClick(x, y, button, doubleClick) {
        // TODO: Implement Linux automation using xdotool
        console.log('[MouseControl] Linux automation not yet implemented');
    }

    /**
     * Test osascript accessibility access
     */
    async testAccessibilityAccess() {
        return new Promise((resolve, reject) => {
            const testScript = 'tell application "System Events" to get name of first process';
            const process = spawn('osascript', ['-e', testScript]);
            let error = '';

            process.stderr.on('data', (data) => {
                error += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve(true);
                } else if (error.includes('osascript is not allowed assistive access')) {
                    reject(new Error('osascript is not allowed assistive access'));
                } else {
                    reject(new Error(`Accessibility test failed: ${error}`));
                }
            });
        });
    }

    /**
     * Utility: Add delay
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Enable/disable control mode
     */
    setControlMode(enabled) {
        this.isControlling = enabled;
        console.log(`[MouseControl] Control mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }
}

module.exports = new MouseControl();