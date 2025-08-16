# Brdy Orbit Chrome Extension

This Chrome extension enables direct browser automation for Google Sheets, CRM forms, and other web applications, providing the seamless automation experience you expect.

## Quick Installation (Development)

1. **Open Chrome Extensions**
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)

2. **Load Extension**
   - Click "Load unpacked"
   - Select the `/src/extensions/chrome` folder
   - Extension will appear in your extensions list

3. **Pin Extension** (Optional)
   - Click the puzzle piece icon in Chrome toolbar
   - Pin "Brdy Orbit Automation" for easy access

## Features

### ✅ **Google Sheets Automation**
- **Bulk data insertion** using clipboard paste
- **Individual cell filling** for precision
- **Smart grid detection** and navigation
- **Formula bar integration**

### ✅ **Form Field Detection**
- **Semantic field mapping** (email, name, phone, etc.)
- **Multi-strategy element finding** (label, placeholder, aria-label)
- **CRM-specific field support** (Salesforce, HubSpot)

### ✅ **Security & Privacy**
- **Minimal permissions** (activeTab, scripting, clipboardWrite)
- **Domain-scoped access** (only Google Sheets, approved CRM sites)
- **No data transmission** - all processing happens locally
- **User consent required** for each automation action

### ✅ **Communication with Orbit**
- **Real-time messaging** between extension and Orbit app
- **Tab detection** and context sharing
- **Fallback clipboard** support when automation fails

## How It Works

### **Architecture**
```
Orbit App ←→ Extension Service Worker ←→ Content Script ←→ Injected Script ←→ Page DOM
```

1. **Orbit App** sends automation requests to extension
2. **Service Worker** routes messages to appropriate tab
3. **Content Script** handles form filling and basic DOM operations
4. **Injected Script** provides deep Google Sheets access
5. **Page DOM** is manipulated directly for reliable automation

### **Google Sheets Integration**
The extension uses multiple methods for maximum compatibility:

**Method 1: Bulk Paste** (Fastest)
- Converts data to TSV format
- Uses clipboard API + keyboard shortcuts
- Triggers Google Sheets' native paste handling

**Method 2: Individual Cells** (Most Reliable)
- Selects each cell via name box or direct navigation
- Activates edit mode (double-click, F2 key)
- Inputs data with proper event triggering

**Method 3: Fallback Clipboard** (Always Works)
- Copies formatted data to clipboard
- User manually pastes with Cmd+V/Ctrl+V

## Usage Examples

### **Basic Google Sheets Automation**
```javascript
// From Orbit app
askService.handleUserMessage("add mock sales data to my google sheet");

// Extension flow:
// 1. Detects open Google Sheets tabs
// 2. Analyzes sheet capabilities
// 3. Generates sample data
// 4. Fills sheet automatically
// 5. Provides user feedback
```

### **CRM Form Filling**
```javascript
// Detected field mappings
const fields = [
    { labelHint: "First Name", value: "John" },
    { labelHint: "Email", value: "john@example.com" },
    { labelHint: "Company", value: "Acme Corp" }
];

// Extension automatically finds and fills matching fields
```

## Permissions Explanation

### **Required Permissions**
- **`activeTab`** - Access current tab for automation (no browsing history)
- **`scripting`** - Inject automation scripts into supported pages
- **`clipboardWrite`** - Copy generated data for manual paste fallback
- **`storage`** - Save user preferences and activity logs locally

### **Host Permissions** (Limited Scope)
- **`https://docs.google.com/*`** - Google Sheets automation
- **`https://sheets.google.com/*`** - Google Sheets automation  
- **`https://*.salesforce.com/*`** - Salesforce CRM automation
- **`https://*.hubspot.com/*`** - HubSpot CRM automation

### **External Connectivity**
- **`http://localhost:*`** - Communication with local Orbit app only
- **No external servers** - All data stays on your machine

## Troubleshooting

### **Extension Not Working**
1. Check that you're on a supported site (Google Sheets, Salesforce, HubSpot)
2. Ensure you have edit permissions on the page
3. Try refreshing the page and retry automation
4. Check browser console for error messages

### **Google Sheets Issues**
1. Make sure you're on an **editable sheet** (not view-only)
2. Try clicking cell A1 before running automation
3. Check that the sheet has loaded completely
4. For shared sheets, ensure you have edit permissions

### **Permission Errors**
1. Grant clipboard access when prompted
2. Allow extension to run on current site
3. Check that the extension is enabled in chrome://extensions/

## Development

### **Testing the Extension**
1. Load extension in developer mode
2. Open a Google Sheets document
3. Click extension icon to verify page detection
4. Test automation through Orbit app or popup interface

### **Debugging**
- **Content Script**: Check browser console on target page
- **Service Worker**: Check extension console in chrome://extensions/
- **Popup**: Right-click extension icon → "Inspect popup"

### **Building for Production**
1. Update manifest version
2. Remove developer-only permissions
3. Add proper extension ID for external messaging
4. Test on clean Chrome profile

## Security Notes

### **Data Privacy**
- ✅ No data sent to external servers
- ✅ All processing happens locally
- ✅ Clipboard access only for automation output
- ✅ No persistent storage of sensitive data

### **Site Access**
- ✅ Only works on explicitly allowed domains
- ✅ Requires user interaction for each automation
- ✅ Can be disabled per-site by user
- ✅ Follows browser security best practices

This extension transforms Orbit from "assisted automation" to "true automation" - giving you the seamless Google Sheets and CRM automation experience you expect.