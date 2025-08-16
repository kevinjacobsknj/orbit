# 🔐 macOS Accessibility Permissions Setup

The computer control feature requires accessibility permissions to interact with your screen. Follow these steps to enable permissions:

## Quick Setup Steps

### Option 1: System Preferences Method (Recommended)
1. Open **System Preferences** (or **System Settings** on macOS 13+)
2. Go to **Security & Privacy** → **Privacy** → **Accessibility**
3. Click the **🔒 lock icon** to make changes (enter your password)
4. Click the **+** button to add applications
5. Add one of these applications:
   - **Terminal** (if running from Terminal)
   - **Visual Studio Code** (if running from VS Code)
   - **Orbit** app (if running as standalone app)

### Option 2: Terminal Permission Prompt
When you run the computer control feature, macOS may show a permission dialog. Click **"Open System Preferences"** and follow Option 1.

### Option 3: Manual osascript Permission
```bash
# Test if permissions are working
osascript -e 'tell application "System Events" to get name of first process'

# If you get permission denied, run:
sudo osascript -e 'tell application "System Events" to get name of first process'
```

## Troubleshooting

### Error: "osascript is not allowed assistive access"
This means accessibility permissions are not granted. Follow Option 1 above.

### Error: "execution error: System Events got an error"
- Restart Terminal or your development environment after adding permissions
- Try running with `sudo` temporarily to test if permissions are the issue

### Still Not Working?
1. **Restart** your Terminal/IDE after adding permissions
2. **Remove and re-add** the application in Accessibility settings
3. Try adding **both** Terminal and your IDE to the accessibility list
4. On newer macOS versions, you may need to add **"osascript"** specifically

## Verifying Setup

Run this test command to verify permissions:
```bash
osascript -e 'tell application "System Events" to click at {100, 100}'
```

If this works without errors, your computer control setup is ready! 🎉

## Security Note
These permissions allow applications to control your computer. Only grant them to trusted applications and development environments.