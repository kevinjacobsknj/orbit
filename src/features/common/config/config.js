// Configuration management for environment-based settings
const os = require('os');
const path = require('path');
const fs = require('fs');

class Config {
    constructor() {
        this.env = process.env.NODE_ENV || 'development';
        this.defaults = {
            apiUrl: process.env.brdyorbit_API_URL || 'http://localhost:9001',
            apiTimeout: 10000,
            
            webUrl: process.env.brdyorbit_WEB_URL || 'http://localhost:3000',
            
            enableJWT: false,
            fallbackToHeaderAuth: false,
            
            cacheTimeout: 5 * 60 * 1000,
            enableCaching: true,
            
            syncInterval: 0,
            healthCheckInterval: 30 * 1000,
            
            defaultWindowWidth: 400,
            defaultWindowHeight: 60,
            
            enableOfflineMode: true,
            enableFileBasedCommunication: false,
            enableSQLiteStorage: true,
            
            logLevel: 'info',
            enableDebugLogging: false
        };
        
        this.config = { ...this.defaults };
        this.loadEnvironmentConfig();
        this.loadUserConfig();
    }
    
    loadEnvironmentConfig() {
        // Brdy Orbit API Configuration
        if (process.env.brdyorbit_API_URL) {
            this.config.apiUrl = process.env.brdyorbit_API_URL;
            console.log(`[Config] API URL from env: ${this.config.apiUrl}`);
        }
        if (process.env.brdyorbit_API_URL) {
            this.config.apiUrl = process.env.brdyorbit_API_URL;
            console.log(`[Config] API URL from env: ${this.config.apiUrl}`);
        }
        
        if (process.env.brdyorbit_WEB_URL) {
            this.config.webUrl = process.env.brdyorbit_WEB_URL;
            console.log(`[Config] Web URL from env: ${this.config.webUrl}`);
        }
        if (process.env.brdyorbit_WEB_URL) {
            this.config.webUrl = process.env.brdyorbit_WEB_URL;
            console.log(`[Config] Web URL from env: ${this.config.webUrl}`);
        }
        
        if (process.env.brdyorbit_API_TIMEOUT) {
            this.config.apiTimeout = parseInt(process.env.brdyorbit_API_TIMEOUT);
        }
        
        if (process.env.brdyorbit_ENABLE_JWT) {
            this.config.enableJWT = process.env.brdyorbit_ENABLE_JWT === 'true';
        }
        
        if (process.env.brdyorbit_CACHE_TIMEOUT) {
            this.config.cacheTimeout = parseInt(process.env.brdyorbit_CACHE_TIMEOUT);
        }
        
        if (process.env.brdyorbit_LOG_LEVEL) {
            this.config.logLevel = process.env.brdyorbit_LOG_LEVEL;
        }
        
        if (process.env.brdyorbit_DEBUG) {
            this.config.enableDebugLogging = process.env.brdyorbit_DEBUG === 'true';
        }

        // AI Provider Configuration
        this.config.aiProviders = {
            openai: {
                apiKey: process.env.OPENAI_API_KEY,
                model: process.env.OPENAI_MODEL || 'gpt-5-2025-08-07',
                modelFast: process.env.OPENAI_MODEL_FAST || 'gpt-5-mini-2025-08-07',
                modelMini: process.env.OPENAI_MODEL_MINI || 'gpt-5-nano-2025-08-07',
                modelReasoning: process.env.OPENAI_MODEL_REASONING || 'gpt-5-2025-08-07',
                transcribeLang: process.env.OPENAI_TRANSCRIBE_LANG || 'en'
            },
            anthropic: {
                apiKey: process.env.ANTHROPIC_API_KEY,
                model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4',
                modelSonnet: process.env.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-4',
                modelHaiku: process.env.ANTHROPIC_MODEL_HAIKU || 'claude-haiku-4'
            },
            google: {
                apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
                model: process.env.GOOGLE_MODEL || 'gemini-2.0-flash-exp',
                modelPro: process.env.GOOGLE_MODEL_PRO || 'gemini-2.0-pro',
                modelUltra: process.env.GOOGLE_MODEL_ULTRA || 'gemini-ultra-2.0'
            },
            deepgram: {
                apiKey: process.env.DEEPGRAM_API_KEY
            },
            portkey: {
                apiKey: process.env.PORTKEY_API_KEY,
                virtualKey: process.env.PORTKEY_VIRTUAL_KEY
            }
        };
        
        if (this.env === 'production') {
            this.config.enableDebugLogging = false;
            this.config.logLevel = 'warn';
        } else if (this.env === 'development') {
            this.config.enableDebugLogging = true;
            this.config.logLevel = 'debug';
        }
    }
    
    loadUserConfig() {
        try {
            const userConfigPath = this.getUserConfigPath();
            if (fs.existsSync(userConfigPath)) {
                const userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
                this.config = { ...this.config, ...userConfig };
                console.log('[Config] User config loaded from:', userConfigPath);
            }
        } catch (error) {
            console.warn('[Config] Failed to load user config:', error.message);
        }
    }
    
    getUserConfigPath() {
        const configDir = path.join(os.homedir(), '.brdyorbit');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        return path.join(configDir, 'config.json');
    }
    
    get(key) {
        return this.config[key];
    }
    
    set(key, value) {
        this.config[key] = value;
    }
    
    getAll() {
        return { ...this.config };
    }
    
    saveUserConfig() {
        try {
            const userConfigPath = this.getUserConfigPath();
            const userConfig = { ...this.config };
            
            Object.keys(this.defaults).forEach(key => {
                if (userConfig[key] === this.defaults[key]) {
                    delete userConfig[key];
                }
            });
            
            fs.writeFileSync(userConfigPath, JSON.stringify(userConfig, null, 2));
            console.log('[Config] User config saved to:', userConfigPath);
        } catch (error) {
            console.error('[Config] Failed to save user config:', error);
        }
    }
    
    reset() {
        this.config = { ...this.defaults };
        this.loadEnvironmentConfig();
    }
    
    isDevelopment() {
        return this.env === 'development';
    }
    
    isProduction() {
        return this.env === 'production';
    }
    
    shouldLog(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.config.logLevel);
        const requestedLevelIndex = levels.indexOf(level);
        return requestedLevelIndex >= currentLevelIndex;
    }
}

const config = new Config();

module.exports = config;