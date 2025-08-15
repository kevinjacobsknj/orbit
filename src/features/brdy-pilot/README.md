# Brdy Pilot - AI-Powered Browser Automation

Brdy Pilot is an integrated Chrome MV3 extension and automation system that brings AI-powered DOM interaction and email automation to the Orbit application.

## Architecture Overview

### 1. Chrome MV3 Extension (`/src/features/brdy-pilot/`)
- **manifest.json**: Chrome extension manifest with MV3 compliance
- **background.js**: Service worker handling extension lifecycle and communication
- **content/content.js**: Content script for DOM interaction and UI overlay
- **content/styles.css**: Styling for extension UI components

### 2. Agent API System (`brdyPilotService.js`)
Stateless API with four main tool calls:

#### DetectApp
- Analyzes current web application type
- Identifies capabilities (email_compose, form_filling, etc.)
- Assesses automation opportunities and security levels
- Returns structured detection results with confidence scores

#### MapFields
- Maps form fields to semantic meanings (email, name, phone, etc.)
- Provides automation strategies and fill order
- Calculates confidence levels for field mappings
- Suggests validation patterns and fill strategies

#### AskUser
- Integrates with Orbit's Ask system for user interaction
- Provides contextual AI assistance
- Handles clarification requests and confirmations
- 30-second timeout with fallback responses

#### DraftText
- Generates contextual text using Orbit's AI
- Supports email drafting, content improvement, translation
- Provides suggestions for text enhancement
- Integrates with existing AI infrastructure

### 3. Action Layer (`actions/actionLayer.js`)
Handles execution with undo/redo support:

#### DOM Fill (`dom_fill`)
- Fills form fields with mapped data
- Captures state for undo operations
- Validates field data before execution
- Provides visual feedback during filling

#### Email Insert (`email_insert`)
- Inserts content into Gmail/Outlook compose areas
- Supports append, prepend, and replace operations
- Detects email application type automatically
- Handles both text and HTML content

#### Apply/Undo Diff Preview
- Shows preview of changes before execution
- Maintains undo/redo stacks for all actions
- Provides rollback capabilities
- Estimates execution time for operations

### 4. Scoped Capture System (`capture/scopedCapture.js`)
Progressive capture with OCR integration:

#### Selection → Focused Form → Region OCR
1. **Smart Selection**: Click any element to start context analysis
2. **Intelligent Scoping**: Automatically determines optimal capture boundaries
3. **Payload Optimization**: Compresses images and keeps payloads tiny
4. **OCR Processing**: Extracts text from captured regions when needed

#### Features
- WebP compression for better file sizes
- Automatic boundary validation
- Form-aware capture expansion
- Device pixel ratio handling for high-DPI screens
- Configurable compression levels

### 5. UI Integration (`/src/ui/app/BrdyPilotView.js`)
LitElement-based interface integrated into Orbit:

#### Components
- **Mode Selector**: Detect, Automate, Capture modes
- **Detection Panel**: Shows app analysis results
- **Actions Grid**: Quick access to main functions
- **Field Mappings**: Visual display of mapped form fields
- **Action History**: Recent operations with timestamps
- **Control Footer**: Settings, history, and activation controls

#### Integration Points
- Added to MainHeader.js as "Brdy" button
- IPC communication through preload.js
- Consistent styling with Orbit's design system
- Real-time status updates and loading states

## Key Features

### 🎯 Smart Detection
- Automatically identifies Gmail, Outlook, forms, and web applications
- Provides confidence scores and security assessments
- Suggests optimal automation strategies

### 🗺️ Intelligent Mapping
- Maps form fields to semantic types
- Handles complex forms with validation
- Provides automation priority and fill order

### 📸 Scoped Capture
- Progressive selection workflow
- Minimal payload sizes through optimization
- OCR integration for text extraction
- Form-aware boundary detection

### ⚡ Action Execution
- Undo/redo support for all operations
- Preview mode for safe operation
- Email-specific insertion logic
- Cross-platform compatibility

### 🤖 AI Integration
- Leverages Orbit's existing AI infrastructure
- Contextual assistance through Ask system
- Smart text generation and improvement
- Real-time status and feedback

## Usage Workflow

1. **Activate Brdy Pilot**: Click the "Brdy" button in Orbit's header
2. **Detect Application**: Analyze the current page for automation opportunities
3. **Map Fields**: Identify and map form fields for automation
4. **Capture Regions**: Use smart capture for OCR and analysis
5. **Execute Actions**: Fill forms, insert email content, or ask for AI assistance
6. **Monitor History**: Track actions with undo/redo capabilities

## Security Considerations

- **Manifest V3 Compliance**: Uses latest Chrome extension security model
- **Permission Minimization**: Only requests necessary permissions
- **Content Isolation**: Secure communication between extension and content
- **Data Validation**: All inputs validated before execution
- **User Consent**: Preview mode for sensitive operations

## Extension Installation

The extension files are structured for easy packaging:

```
src/features/brdy-pilot/
├── manifest.json
├── background.js
├── content/
│   ├── content.js
│   └── styles.css
└── icons/ (to be added)
```

To install:
1. Build the extension files
2. Load as unpacked extension in Chrome
3. Grant necessary permissions
4. Connect to Orbit application

## API Reference

### IPC Methods
- `brdy-pilot:toggle` - Toggle Brdy Pilot interface
- `brdy-pilot:action` - Execute Brdy Pilot actions
- `brdy-pilot:detectApp` - Analyze current application
- `brdy-pilot:mapFields` - Map form fields
- `brdy-pilot:startCapture` - Begin capture workflow

### Tool Call Responses
All tool calls return standardized response format:
```javascript
{
    success: boolean,
    data: any,
    error?: string,
    timestamp: number
}
```

## Future Enhancements

- **Multi-step Workflows**: Chain multiple actions together
- **Custom Field Types**: Support for application-specific fields
- **Batch Operations**: Process multiple forms or emails
- **Machine Learning**: Improve detection and mapping accuracy
- **Mobile Support**: Extend to mobile browsers and apps
- **API Integrations**: Connect with external services and databases

---

Brdy Pilot brings powerful AI-driven automation to web browsing while maintaining security, user control, and integration with Orbit's existing capabilities.