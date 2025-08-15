/**
 * Voice Text Processor (Client-side version for Ask window)
 * Handles real-time text formatting, commands, and style adaptation
 */

export class VoiceTextProcessor {
    constructor() {
        // Common filler words to remove
        this.fillerWords = new Set([
            'um', 'uh', 'umm', 'uhh', 'ah', 'ahh', 'er', 'err',
            'like', 'you know', 'basically', 'actually', 'literally',
            'sort of', 'kind of', 'i mean', 'well', 'so yeah'
        ]);

        // Voice commands mapping
        this.voiceCommands = {
            // Formatting commands
            'new line': '\n',
            'new paragraph': '\n\n',
            'dash': ' - ',
            'bullet': '• ',
            'bullet point': '• ',
            'comma': ', ',
            'period': '. ',
            'question mark': '? ',
            'exclamation': '! ',
            'exclamation mark': '! ',
            'colon': ': ',
            'semicolon': '; ',
            'quote': '"',
            'end quote': '"',
            'open parenthesis': '(',
            'close parenthesis': ')',
            'tab': '\t',
            
            // Structure commands
            'number one': '1. ',
            'number two': '2. ',
            'number three': '3. ',
            'number four': '4. ',
            'number five': '5. ',
            
            // Code-related commands
            'open bracket': '[',
            'close bracket': ']',
            'open brace': '{',
            'close brace': '}',
            'forward slash': '/',
            'backslash': '\\',
            'at sign': '@',
            'hashtag': '#',
            'dollar sign': '$',
            'percent': '%',
            'ampersand': '&',
            'asterisk': '*',
            'underscore': '_'
        };

        // User preferences (loaded from localStorage)
        this.userPreferences = this.loadUserPreferences();
        
        // Current context
        this.currentContext = 'general';
        this.currentTone = this.userPreferences.defaultTone || 'casual';
        
        // Track partial text for better processing
        this.lastPartialText = '';
        this.currentSentence = '';
    }

    /**
     * Process incoming text with all formatting features
     */
    processText(text, isPartial = false, context = null) {
        if (!text) return '';

        let processed = text;

        // For partial results, we need to be more careful
        if (isPartial) {
            // Store the partial text
            this.lastPartialText = text;
            
            // Process voice commands that are complete
            processed = this.processVoiceCommandsPartial(processed);
            
            // Remove obvious filler words
            processed = this.removeFillersWordsPartial(processed);
            
            // Fix basic grammar
            processed = this.fixGrammarPartial(processed);
            
            // Apply basic capitalization
            processed = this.capitalizePartial(processed);
            
        } else {
            // Full processing for final text
            
            // Step 1: Process voice commands first
            processed = this.processVoiceCommands(processed);

            // Step 2: Remove filler words
            processed = this.removeFillersWords(processed);

            // Step 3: Add natural punctuation
            processed = this.addNaturalPunctuation(processed);

            // Step 4: Fix grammar
            processed = this.fixGrammar(processed);

            // Step 5: Apply tone and style
            processed = this.applyToneAndStyle(processed, context);

            // Step 6: Capitalize sentences
            processed = this.capitalizeSentences(processed);

            // Learn from the processed text
            this.learnFromText(text, processed);
            
            // Reset partial tracking
            this.lastPartialText = '';
            this.currentSentence = '';
        }

        return processed;
    }

    /**
     * Process voice commands in partial text (only complete commands)
     */
    processVoiceCommandsPartial(text) {
        let processed = text;
        
        // Only process commands that appear to be complete (followed by space or end of text)
        for (const [command, replacement] of Object.entries(this.voiceCommands)) {
            const regex = new RegExp(`\\b${command}\\b(?=\\s|$)`, 'gi');
            processed = processed.replace(regex, replacement);
        }

        return processed;
    }

    /**
     * Process voice commands in text
     */
    processVoiceCommands(text) {
        let processed = text.toLowerCase();
        
        // Sort commands by length (longest first) to avoid partial matches
        const sortedCommands = Object.keys(this.voiceCommands)
            .sort((a, b) => b.length - a.length);

        for (const command of sortedCommands) {
            const regex = new RegExp(`\\b${command}\\b`, 'gi');
            processed = processed.replace(regex, this.voiceCommands[command]);
        }

        return processed;
    }

    /**
     * Remove filler words from partial text
     */
    removeFillersWordsPartial(text) {
        let processed = text;
        
        // Only remove filler words that are complete words
        for (const filler of this.fillerWords) {
            const regex = new RegExp(`\\b${filler}\\b(?=\\s)`, 'gi');
            processed = processed.replace(regex, '');
        }
        
        // Clean up extra spaces
        processed = processed.replace(/\s+/g, ' ').trim();
        
        return processed;
    }

    /**
     * Remove filler words from text
     */
    removeFillersWords(text) {
        let processed = text;
        
        // Create regex for filler words
        const fillerPattern = Array.from(this.fillerWords)
            .map(word => `\\b${word}\\b`)
            .join('|');
        
        const regex = new RegExp(`(${fillerPattern})\\s*`, 'gi');
        processed = processed.replace(regex, '');
        
        // Clean up extra spaces
        processed = processed.replace(/\s+/g, ' ').trim();
        
        return processed;
    }

    /**
     * Add natural punctuation to text
     */
    addNaturalPunctuation(text) {
        if (!text) return '';

        let processed = text;

        // Add question marks for questions
        const questionWords = /^(who|what|when|where|why|how|is|are|can|could|would|should|do|does|did|will|won't|isn't|aren't|can't|couldn't|wouldn't|shouldn't|don't|doesn't|didn't)\b/i;
        if (questionWords.test(processed) && !processed.match(/[.!?]$/)) {
            processed += '?';
        }
        
        // Add periods for statements (if no punctuation exists)
        else if (!processed.match(/[.!?,:;]$/)) {
            processed += '.';
        }

        // Add commas for natural pauses (before conjunctions)
        processed = processed.replace(/\s+(and|but|or|so|yet)\s+/gi, (match, p1) => {
            return ', ' + p1.toLowerCase() + ' ';
        });

        return processed;
    }

    /**
     * Fix grammar in partial text
     */
    fixGrammarPartial(text) {
        let processed = text;

        // Fix double spaces
        processed = processed.replace(/\s+/g, ' ');

        // Fix "i" to "I"
        processed = processed.replace(/\bi\b/g, 'I');

        // Fix contractions that are complete
        const contractionFixes = {
            'dont': "don't",
            'wont': "won't",
            'cant': "can't",
            'isnt': "isn't",
            'arent': "aren't",
            'im': "I'm",
            'youre': "you're",
            'theyre': "they're",
            'its': "it's",
            'thats': "that's",
            'whats': "what's"
        };

        for (const [wrong, correct] of Object.entries(contractionFixes)) {
            const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
            processed = processed.replace(regex, correct);
        }

        return processed;
    }

    /**
     * Fix common grammar issues
     */
    fixGrammar(text) {
        let processed = text;

        // Fix double spaces
        processed = processed.replace(/\s+/g, ' ');

        // Fix "i" to "I"
        processed = processed.replace(/\bi\b/g, 'I');

        // Fix all contractions
        const contractionFixes = {
            'dont': "don't",
            'wont': "won't",
            'cant': "can't",
            'didnt': "didn't",
            'doesnt': "doesn't",
            'isnt': "isn't",
            'arent': "aren't",
            'wasnt': "wasn't",
            'werent': "weren't",
            'havent': "haven't",
            'hasnt': "hasn't",
            'hadnt': "hadn't",
            'wouldnt': "wouldn't",
            'shouldnt': "shouldn't",
            'couldnt': "couldn't",
            'youre': "you're",
            'theyre': "they're",
            'were': "we're",
            'its': "it's",
            'lets': "let's",
            'thats': "that's",
            'whats': "what's",
            'heres': "here's",
            'theres': "there's",
            'wheres': "where's",
            'im': "I'm",
            'ive': "I've",
            'ill': "I'll",
            'id': "I'd"
        };

        for (const [wrong, correct] of Object.entries(contractionFixes)) {
            const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
            processed = processed.replace(regex, correct);
        }

        // Fix a/an usage
        processed = processed.replace(/\ba\s+([aeiou])/gi, 'an $1');
        processed = processed.replace(/\ban\s+([^aeiou])/gi, 'a $1');

        return processed;
    }

    /**
     * Apply tone and style based on context
     */
    applyToneAndStyle(text, context) {
        let processed = text;
        
        // Determine context and tone
        const detectedContext = context || this.detectContext(text);
        const tone = this.determineTone(detectedContext);

        // Apply tone-specific transformations
        if (tone === 'formal') {
            // Remove contractions for formal tone
            processed = this.removeContractions(processed);
            
            // Replace casual phrases
            const casualToFormal = {
                'hey': 'hello',
                'hi': 'hello',
                'yeah': 'yes',
                'yep': 'yes',
                'nope': 'no',
                'thanks': 'thank you',
                'bye': 'goodbye',
                'ok': 'okay',
                'gonna': 'going to',
                'wanna': 'want to',
                'gotta': 'have to'
            };

            for (const [casual, formal] of Object.entries(casualToFormal)) {
                const regex = new RegExp(`\\b${casual}\\b`, 'gi');
                processed = processed.replace(regex, formal);
            }
        }

        return processed;
    }

    /**
     * Remove contractions for formal tone
     */
    removeContractions(text) {
        const contractions = {
            "don't": 'do not',
            "won't": 'will not',
            "can't": 'cannot',
            "didn't": 'did not',
            "doesn't": 'does not',
            "isn't": 'is not',
            "aren't": 'are not',
            "wasn't": 'was not',
            "weren't": 'were not',
            "haven't": 'have not',
            "hasn't": 'has not',
            "hadn't": 'had not',
            "wouldn't": 'would not',
            "shouldn't": 'should not',
            "couldn't": 'could not',
            "you're": 'you are',
            "they're": 'they are',
            "we're": 'we are',
            "it's": 'it is',
            "that's": 'that is',
            "what's": 'what is',
            "I'm": 'I am',
            "I've": 'I have',
            "I'll": 'I will',
            "I'd": 'I would'
        };

        let processed = text;
        for (const [contraction, expanded] of Object.entries(contractions)) {
            const regex = new RegExp(contraction.replace(/'/g, "'"), 'gi');
            processed = processed.replace(regex, expanded);
        }

        return processed;
    }

    /**
     * Capitalize partial text appropriately
     */
    capitalizePartial(text) {
        if (!text) return '';
        
        // Capitalize first letter
        let processed = text.charAt(0).toUpperCase() + text.slice(1);
        
        // Capitalize I
        processed = processed.replace(/\bi\b/g, 'I');
        
        return processed;
    }

    /**
     * Capitalize sentences properly
     */
    capitalizeSentences(text) {
        // Capitalize first letter
        let processed = text.charAt(0).toUpperCase() + text.slice(1);

        // Capitalize after sentence endings
        processed = processed.replace(/([.!?]\s+)([a-z])/g, (match, p1, p2) => {
            return p1 + p2.toUpperCase();
        });

        // Capitalize after new lines
        processed = processed.replace(/(\n+)([a-z])/g, (match, p1, p2) => {
            return p1 + p2.toUpperCase();
        });

        // Capitalize I
        processed = processed.replace(/\bi\b/g, 'I');

        return processed;
    }

    /**
     * Detect context from text
     */
    detectContext(text) {
        // Check for email patterns
        if (text.includes('@') || /dear|sincerely|regards/i.test(text)) {
            return 'email';
        }

        // Check for code patterns
        if (/function|const|let|var|if|else|for|while|class|import|export/i.test(text)) {
            return 'code';
        }

        // Check for formal indicators
        if (/mr\.|mrs\.|ms\.|dr\.|prof\./i.test(text)) {
            return 'formal';
        }

        return 'general';
    }

    /**
     * Determine tone based on context
     */
    determineTone(context) {
        const contextToneMap = {
            'email': 'formal',
            'code': 'technical',
            'formal': 'formal',
            'general': this.userPreferences.defaultTone || 'casual'
        };

        return contextToneMap[context] || 'casual';
    }

    /**
     * Learn from user's text patterns
     */
    learnFromText(original, processed) {
        // Track user's preferred words and phrases
        if (!this.userPreferences.patterns) {
            this.userPreferences.patterns = {};
        }

        // Save preferences periodically
        this.saveUserPreferences();
    }

    /**
     * Load user preferences from localStorage
     */
    loadUserPreferences() {
        try {
            const stored = localStorage.getItem('voiceTextPreferences');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (error) {
            console.error('Error loading voice text preferences:', error);
        }

        // Default preferences
        return {
            defaultTone: 'casual',
            autoCapitalize: true,
            removeFiller: true,
            patterns: {},
            customCommands: {}
        };
    }

    /**
     * Save user preferences to localStorage
     */
    saveUserPreferences() {
        try {
            localStorage.setItem('voiceTextPreferences', JSON.stringify(this.userPreferences));
        } catch (error) {
            console.error('Error saving voice text preferences:', error);
        }
    }

    /**
     * Set default tone
     */
    setDefaultTone(tone) {
        this.userPreferences.defaultTone = tone;
        this.currentTone = tone;
        this.saveUserPreferences();
    }

    /**
     * Toggle filler word removal
     */
    toggleFillerRemoval(enabled) {
        this.userPreferences.removeFiller = enabled;
        this.saveUserPreferences();
    }

    /**
     * Add custom command
     */
    addCustomCommand(phrase, replacement) {
        this.voiceCommands[phrase.toLowerCase()] = replacement;
        if (!this.userPreferences.customCommands) {
            this.userPreferences.customCommands = {};
        }
        this.userPreferences.customCommands[phrase.toLowerCase()] = replacement;
        this.saveUserPreferences();
    }
}

// Create and export singleton instance
export const voiceTextProcessor = new VoiceTextProcessor();