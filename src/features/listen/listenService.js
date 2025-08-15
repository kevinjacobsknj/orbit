const { BrowserWindow } = require('electron');
const SttService = require('./stt/sttService');
const SummaryService = require('./summary/summaryService');
const authService = require('../common/services/authService');
const sessionRepository = require('../common/repositories/session');
const sttRepository = require('./stt/repositories');
const internalBridge = require('../../bridge/internalBridge');
const brdyPilotService = require('../brdy-pilot/brdyPilotService');

class ListenService {
    constructor() {
        this.sttService = new SttService();
        this.summaryService = new SummaryService();
        this.currentSessionId = null;
        this.isInitializingSession = false;

        this.setupServiceCallbacks();
        console.log('[ListenService] Service instance created.');
    }

    setupServiceCallbacks() {
        // STT service callbacks
        this.sttService.setCallbacks({
            onTranscriptionComplete: (speaker, text) => {
                this.handleTranscriptionComplete(speaker, text);
            },
            onStatusUpdate: (status) => {
                this.sendToRenderer('update-status', status);
            }
        });

        // Summary service callbacks
        this.summaryService.setCallbacks({
            onAnalysisComplete: (data) => {
                console.log('📊 Analysis completed:', data);
            },
            onStatusUpdate: (status) => {
                this.sendToRenderer('update-status', status);
            }
        });
    }

    sendToRenderer(channel, data) {
        const { windowPool } = require('../../window/windowManager');
        const listenWindow = windowPool?.get('listen');
        
        if (listenWindow && !listenWindow.isDestroyed()) {
            listenWindow.webContents.send(channel, data);
        }
    }

    initialize() {
        this.setupIpcHandlers();
        console.log('[ListenService] Initialized and ready.');
    }

    async handleListenRequest(listenButtonText) {
        const { windowPool } = require('../../window/windowManager');
        const listenWindow = windowPool.get('listen');
        const header = windowPool.get('header');

        try {
            switch (listenButtonText) {
                case 'Listen':
                    console.log('[ListenService] changeSession to "Listen"');
                    internalBridge.emit('window:requestVisibility', { name: 'listen', visible: true });
                    await this.initializeSession();
                    if (listenWindow && !listenWindow.isDestroyed()) {
                        listenWindow.webContents.send('session-state-changed', { isActive: true });
                    }
                    break;
        
                case 'Stop':
                    console.log('[ListenService] changeSession to "Stop"');
                    await this.closeSession();
                    if (listenWindow && !listenWindow.isDestroyed()) {
                        listenWindow.webContents.send('session-state-changed', { isActive: false });
                    }
                    break;
        
                case 'Done':
                    console.log('[ListenService] changeSession to "Done"');
                    internalBridge.emit('window:requestVisibility', { name: 'listen', visible: false });
                    listenWindow.webContents.send('session-state-changed', { isActive: false });
                    break;
        
                default:
                    throw new Error(`[ListenService] unknown listenButtonText: ${listenButtonText}`);
            }
            
            header.webContents.send('listen:changeSessionResult', { success: true });

        } catch (error) {
            console.error('[ListenService] error in handleListenRequest:', error);
            header.webContents.send('listen:changeSessionResult', { success: false });
            throw error; 
        }
    }

    async handleTranscriptionComplete(speaker, text) {
        console.log(`[ListenService] Transcription complete: ${speaker} - ${text}`);
        
        // Save to database
        await this.saveConversationTurn(speaker, text);
        
        // Check for Brdy Pilot voice commands
        await this._processBrdyPilotVoiceCommand(text);
        
        // Add to summary service for analysis
        this.summaryService.addConversationTurn(speaker, text);
    }

    async saveConversationTurn(speaker, transcription) {
        if (!this.currentSessionId) {
            console.error('[DB] Cannot save turn, no active session ID.');
            return;
        }
        if (transcription.trim() === '') return;

        try {
            await sessionRepository.touch(this.currentSessionId);
            await sttRepository.addTranscript({
                sessionId: this.currentSessionId,
                speaker: speaker,
                text: transcription.trim(),
            });
            console.log(`[DB] Saved transcript for session ${this.currentSessionId}: (${speaker})`);
        } catch (error) {
            console.error('Failed to save transcript to DB:', error);
        }
    }

    async initializeNewSession() {
        try {
            // The UID is no longer passed to the repository method directly.
            // The adapter layer handles UID injection. We just ensure a user is available.
            const user = authService.getCurrentUser();
            if (!user) {
                // This case should ideally not happen as authService initializes a default user.
                throw new Error("Cannot initialize session: auth service not ready.");
            }
            
            this.currentSessionId = await sessionRepository.getOrCreateActive('listen');
            console.log(`[DB] New listen session ensured: ${this.currentSessionId}`);

            // Set session ID for summary service
            this.summaryService.setSessionId(this.currentSessionId);
            
            // Reset conversation history
            this.summaryService.resetConversationHistory();

            console.log('New conversation session started:', this.currentSessionId);
            return true;
        } catch (error) {
            console.error('Failed to initialize new session in DB:', error);
            this.currentSessionId = null;
            return false;
        }
    }

    async initializeSession(language = 'en') {
        if (this.isInitializingSession) {
            console.log('Session initialization already in progress.');
            return false;
        }

        this.isInitializingSession = true;
        this.sendToRenderer('session-initializing', true);
        this.sendToRenderer('update-status', 'Initializing sessions...');

        try {
            // Initialize database session
            const sessionInitialized = await this.initializeNewSession();
            if (!sessionInitialized) {
                throw new Error('Failed to initialize database session');
            }

            /* ---------- STT Initialization Retry Logic ---------- */
            const MAX_RETRY = 10;
            const RETRY_DELAY_MS = 300;   // 0.3 seconds

            let sttReady = false;
            for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
                try {
                    await this.sttService.initializeSttSessions(language);
                    sttReady = true;
                    break;                         // Exit on success
                } catch (err) {
                    console.warn(
                        `[ListenService] STT init attempt ${attempt} failed: ${err.message}`
                    );
                    if (attempt < MAX_RETRY) {
                        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                    }
                }
            }
            if (!sttReady) throw new Error('STT init failed after retries');
            /* ------------------------------------------- */

            console.log('✅ Listen service initialized successfully.');
            
            this.sendToRenderer('update-status', 'Connected. Ready to listen.');
            
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize listen service:', error);
            this.sendToRenderer('update-status', 'Initialization failed.');
            return false;
        } finally {
            this.isInitializingSession = false;
            this.sendToRenderer('session-initializing', false);
            this.sendToRenderer('change-listen-capture-state', { status: "start" });
        }
    }

    async sendMicAudioContent(data, mimeType) {
        return await this.sttService.sendMicAudioContent(data, mimeType);
    }

    async startMacOSAudioCapture() {
        if (process.platform !== 'darwin') {
            throw new Error('macOS audio capture only available on macOS');
        }
        return await this.sttService.startMacOSAudioCapture();
    }

    async stopMacOSAudioCapture() {
        this.sttService.stopMacOSAudioCapture();
    }

    isSessionActive() {
        return this.sttService.isSessionActive();
    }

    async closeSession() {
        try {
            this.sendToRenderer('change-listen-capture-state', { status: "stop" });
            // Close STT sessions
            await this.sttService.closeSessions();

            await this.stopMacOSAudioCapture();

            // End database session
            if (this.currentSessionId) {
                await sessionRepository.end(this.currentSessionId);
                console.log(`[DB] Session ${this.currentSessionId} ended.`);
            }

            // Reset state
            this.currentSessionId = null;
            this.summaryService.resetConversationHistory();

            console.log('Listen service session closed.');
            return { success: true };
        } catch (error) {
            console.error('Error closing listen service session:', error);
            return { success: false, error: error.message };
        }
    }

    getCurrentSessionData() {
        return {
            sessionId: this.currentSessionId,
            conversationHistory: this.summaryService.getConversationHistory(),
            totalTexts: this.summaryService.getConversationHistory().length,
            analysisData: this.summaryService.getCurrentAnalysisData(),
        };
    }

    getConversationHistory() {
        return this.summaryService.getConversationHistory();
    }

    _createHandler(asyncFn, successMessage, errorMessage) {
        return async (...args) => {
            try {
                const result = await asyncFn.apply(this, args);
                if (successMessage) console.log(successMessage);
                // `startMacOSAudioCapture`는 성공 시 { success, error } 객체를 반환하지 않으므로,
                // 핸들러가 일관된 응답을 보내도록 여기서 success 객체를 반환합니다.
                // 다른 함수들은 이미 success 객체를 반환합니다.
                return result && typeof result.success !== 'undefined' ? result : { success: true };
            } catch (e) {
                console.error(errorMessage, e);
                return { success: false, error: e.message };
            }
        };
    }

    // `_createHandler`를 사용하여 핸들러들을 동적으로 생성합니다.
    handleSendMicAudioContent = this._createHandler(
        this.sendMicAudioContent,
        null,
        'Error sending user audio:'
    );

    handleStartMacosAudio = this._createHandler(
        async () => {
            if (process.platform !== 'darwin') {
                return { success: false, error: 'macOS audio capture only available on macOS' };
            }
            if (this.sttService.isMacOSAudioRunning?.()) {
                return { success: false, error: 'already_running' };
            }
            await this.startMacOSAudioCapture();
            return { success: true, error: null };
        },
        'macOS audio capture started.',
        'Error starting macOS audio capture:'
    );
    
    handleStopMacosAudio = this._createHandler(
        this.stopMacOSAudioCapture,
        'macOS audio capture stopped.',
        'Error stopping macOS audio capture:'
    );

    handleUpdateGoogleSearchSetting = this._createHandler(
        async (enabled) => {
            console.log('Google Search setting updated to:', enabled);
        },
        null,
        'Error updating Google Search setting:'
    );

    /**
     * Process voice commands for Brdy Pilot automation
     * @private
     */
    async _processBrdyPilotVoiceCommand(transcribedText) {
        const text = transcribedText.toLowerCase().trim();
        
        // Voice command patterns for automation
        const voiceCommands = {
            fillForm: [
                'fill out the form', 'fill this form', 'fill the form for me',
                'auto fill form', 'complete the form', 'populate the form'
            ],
            draftEmail: [
                'draft an email', 'compose email', 'write an email',
                'create email draft', 'help me write email', 'email composition'
            ],
            extractText: [
                'extract text', 'get text from page', 'read the page',
                'what does this say', 'extract information', 'pull text'
            ],
            detectApp: [
                'what application is this', 'detect this app', 'analyze this page',
                'what kind of form is this', 'identify this website'
            ],
            automation: [
                'automate this', 'help me automate', 'set up automation',
                'can you automate', 'automation help', 'make this automatic'
            ]
        };

        // Check for voice command matches
        for (const [command, patterns] of Object.entries(voiceCommands)) {
            if (patterns.some(pattern => text.includes(pattern))) {
                console.log(`[ListenService] Detected Brdy Pilot voice command: ${command}`);
                await this._executeBrdyPilotVoiceCommand(command, transcribedText);
                return;
            }
        }

        // Check for activation phrases
        const activationPhrases = [
            'hey brdy', 'brdy pilot', 'orbit automate', 'automation mode'
        ];

        if (activationPhrases.some(phrase => text.includes(phrase))) {
            console.log('[ListenService] Brdy Pilot activation detected via voice');
            await this._activateBrdyPilotMode(transcribedText);
        }
    }

    /**
     * Execute specific Brdy Pilot voice commands
     * @private
     */
    async _executeBrdyPilotVoiceCommand(commandType, originalText) {
        try {
            // Send to renderer to show activation
            this.sendToRenderer('brdy-pilot-voice-command', {
                command: commandType,
                originalText: originalText,
                timestamp: Date.now()
            });

            // Trigger appropriate Ask window action based on command
            const askService = require('../ask/askService');
            
            let automationPrompt = '';
            
            switch (commandType) {
                case 'fillForm':
                    automationPrompt = 'Fill out this form for me';
                    break;
                case 'draftEmail':
                    automationPrompt = 'Draft an email response';
                    break;
                case 'extractText':
                    automationPrompt = 'Extract text from this page';
                    break;
                case 'detectApp':
                    automationPrompt = 'Analyze this application and tell me what it is';
                    break;
                case 'automation':
                    automationPrompt = 'Help me automate this page';
                    break;
                default:
                    automationPrompt = originalText;
            }

            // Show Ask window and send automation request
            await askService.toggleAskButton();
            
            // Slight delay to ensure Ask window is ready
            setTimeout(async () => {
                await askService.sendMessage(automationPrompt, []);
            }, 500);

            console.log(`[ListenService] Executed Brdy Pilot command: ${commandType}`);
            
        } catch (error) {
            console.error('[ListenService] Error executing Brdy Pilot voice command:', error);
        }
    }

    /**
     * Activate Brdy Pilot mode from voice
     * @private
     */
    async _activateBrdyPilotMode(originalText) {
        try {
            console.log('[ListenService] Activating Brdy Pilot mode via voice');
            
            // Send to renderer
            this.sendToRenderer('brdy-pilot-activated', {
                activatedBy: 'voice',
                originalText: originalText,
                timestamp: Date.now()
            });

            // Open Ask window with general automation prompt
            const askService = require('../ask/askService');
            await askService.toggleAskButton();
            
            setTimeout(async () => {
                await askService.sendMessage('I heard you say "' + originalText + '". How can I help you automate this page?', []);
            }, 500);
            
        } catch (error) {
            console.error('[ListenService] Error activating Brdy Pilot mode:', error);
        }
    }

    /**
     * Get voice command suggestions for current context
     */
    getBrdyPilotVoiceSuggestions() {
        return {
            formFilling: [
                "Fill out the form",
                "Complete this form for me", 
                "Auto-fill the form"
            ],
            emailComposition: [
                "Draft an email",
                "Help me write an email",
                "Compose a professional message"
            ],
            textExtraction: [
                "Extract text from this page",
                "What does this page say",
                "Get the text content"
            ],
            automation: [
                "Help me automate this",
                "Set up automation",
                "What can you automate here"
            ],
            activation: [
                "Hey Brdy",
                "Brdy Pilot",
                "Orbit automate"
            ]
        };
    }

    /**
     * Check if voice command processing is enabled
     */
    isBrdyPilotVoiceEnabled() {
        return true; // Can be made configurable later
    }
}

const listenService = new ListenService();
module.exports = listenService;