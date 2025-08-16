/**
 * Permission Manager for macOS Accessibility and Screen Capture
 * Handles requesting and checking permissions for computer control
 */

// Check if Electron is available
let systemPreferences, shell, dialog;
try {
    if (process.versions.electron) {
        ({ systemPreferences, shell, dialog } = require('electron'));
    }
} catch (error) {
    console.warn('[PermissionManager] Electron APIs not available:', error.message);
}

class PermissionManager {
    constructor() {
        this.permissions = {
            accessibility: false,
            screenCapture: false,
            microphone: false
        };
    }

    /**
     * Check all required permissions
     */
    async checkPermissions() {
        try {
            // Check if Electron APIs are available
            if (!systemPreferences) {
                console.warn('[PermissionManager] systemPreferences not available - not in Electron context');
                return this.permissions;
            }
            
            // Check screen capture permission
            this.permissions.screenCapture = systemPreferences.getMediaAccessStatus('screen') === 'granted';
            
            // Check microphone permission
            this.permissions.microphone = systemPreferences.getMediaAccessStatus('microphone') === 'granted';
            
            // Accessibility permission check (macOS specific)
            if (process.platform === 'darwin') {
                this.permissions.accessibility = systemPreferences.isTrustedAccessibilityClient(false);
            }

            console.log('[PermissionManager] Current permissions:', this.permissions);
            return this.permissions;
        } catch (error) {
            console.error('[PermissionManager] Error checking permissions:', error);
            return this.permissions;
        }
    }

    /**
     * Request all necessary permissions
     */
    async requestPermissions() {
        try {
            console.log('[PermissionManager] Requesting permissions...');
            
            // Check if Electron APIs are available
            if (!systemPreferences) {
                console.warn('[PermissionManager] Cannot request permissions - not in Electron context');
                return false;
            }
            
            // Request screen capture permission
            if (!this.permissions.screenCapture) {
                await systemPreferences.askForMediaAccess('screen');
            }
            
            // Request microphone permission
            if (!this.permissions.microphone) {
                await systemPreferences.askForMediaAccess('microphone');
            }
            
            // For accessibility, we need to prompt user to go to System Preferences
            if (!this.permissions.accessibility && process.platform === 'darwin') {
                await this.promptAccessibilityPermission();
            }
            
            // Recheck permissions
            return await this.checkPermissions();
        } catch (error) {
            console.error('[PermissionManager] Error requesting permissions:', error);
            return this.permissions;
        }
    }

    /**
     * Prompt user to enable accessibility permission
     */
    async promptAccessibilityPermission() {
        const result = await dialog.showMessageBox({
            type: 'info',
            title: 'Accessibility Permission Required',
            message: 'Orbit needs accessibility permission to control your computer',
            detail: 'This allows Orbit to:\n• Click buttons and interact with applications\n• Type text automatically\n• Control mouse and keyboard\n\nWould you like to open System Preferences to enable this?',
            buttons: ['Open System Preferences', 'Cancel'],
            defaultId: 0,
            cancelId: 1
        });

        if (result.response === 0) {
            // Open System Preferences to Accessibility
            await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
            
            // Show follow-up instructions
            await dialog.showMessageBox({
                type: 'info',
                title: 'Enable Accessibility Access',
                message: 'Please follow these steps:',
                detail: '1. Click the lock icon and enter your password\n2. Find "Orbit" or "Electron" in the list\n3. Check the box next to it\n4. Restart Orbit for changes to take effect',
                buttons: ['OK']
            });
        }
    }

    /**
     * Check if we have all required permissions
     */
    hasAllPermissions() {
        return this.permissions.accessibility && this.permissions.screenCapture;
    }

    /**
     * Get permission status for a specific permission
     */
    hasPermission(type) {
        return this.permissions[type] || false;
    }

    /**
     * Auto-request permissions on startup
     */
    async initialize() {
        console.log('[PermissionManager] Initializing permission checks...');
        
        await this.checkPermissions();
        
        if (!this.hasAllPermissions()) {
            console.log('[PermissionManager] Some permissions missing, will request when needed');
        } else {
            console.log('[PermissionManager] ✅ All permissions granted');
        }
    }

    /**
     * Request permissions if not already granted
     */
    async ensurePermissions() {
        await this.checkPermissions();
        
        if (!this.hasAllPermissions()) {
            console.log('[PermissionManager] Requesting missing permissions...');
            await this.requestPermissions();
        }
        
        return this.hasAllPermissions();
    }

    /**
     * Show permission status
     */
    getPermissionStatus() {
        return {
            accessibility: {
                granted: this.permissions.accessibility,
                description: 'Required for mouse and keyboard control'
            },
            screenCapture: {
                granted: this.permissions.screenCapture,
                description: 'Required for analyzing screen content'
            },
            microphone: {
                granted: this.permissions.microphone,
                description: 'Required for voice commands'
            }
        };
    }
}

module.exports = new PermissionManager();