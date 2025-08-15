/**
 * Voice Text Processor - Handles real-time text formatting, commands, and style adaptation
 * Features:
 * - Real-time punctuation and grammar correction
 * - Filler word removal
 * - Voice command processing
 * - Tone and style adaptation
 * - User preference learning
 */

class VoiceTextProcessor {
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

        // Tone settings
        this.toneSettings = {
            formal: {
                contractions: false,
                casualPhrases: false,
                professionalGreetings: true
            },
            casual: {
                contractions: true,
                casualPhrases: true,
                professionalGreetings: false
            },
            technical: {
                contractions: false,
                casualPhrases: false,
                technicalTerms: true
            }
        };

        // User preferences (loaded from storage)
        this.userPreferences = this.loadUserPreferences();
        
        // Current context
        this.currentContext = 'general';
        this.currentTone = 'casual';
    }

    /**
     * Process incoming text with all formatting features
     */
    processText(text, isPartial = false, context = null) {
        if (!text) return '';

        let processed = text;

        // Step 1: Process voice commands first
        processed = this.processVoiceCommands(processed);

        // Step 2: Remove filler words
        processed = this.removeFillersWords(processed);

        // Step 3: Add natural punctuation
        processed = this.addNaturalPunctuation(processed, isPartial);

        // Step 4: Fix grammar
        processed = this.fixGrammar(processed);

        // Step 5: Apply tone and style
        processed = this.applyToneAndStyle(processed, context);

        // Step 6: Capitalize sentences
        processed = this.capitalizeSentences(processed);

        // Learn from the processed text
        this.learnFromText(text, processed);

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
    addNaturalPunctuation(text, isPartial) {
        if (!text) return '';

        let processed = text;

        // Don't add punctuation to partial results
        if (isPartial) return processed;

        // Add question marks for questions
        const questionWords = /^(who|what|when|where|why|how|is|are|can|could|would|should|do|does|did|will|won't|isn't|aren't|can't|couldn't|wouldn't|shouldn't|don't|doesn't|didn't)\b/i;
        if (questionWords.test(processed) && !processed.match(/[.!?]$/)) {
            processed += '?';
        }
        
        // Add periods for statements (if no punctuation exists)
        else if (!processed.match(/[.!?]$/)) {
            processed += '.';
        }

        // Add commas for natural pauses (before conjunctions)
        processed = processed.replace(/\b(and|but|or|so|yet)\b/gi, (match, p1, offset) => {
            // Check if there's already a comma before
            const before = processed.substring(Math.max(0, offset - 2), offset);
            if (!before.includes(',')) {
                return ', ' + p1;
            }
            return p1;
        });

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

        // Fix common contractions
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
            'mightnt': "mightn't",
            'mustnt': "mustn't",
            'wouldve': "would've",
            'shouldve': "should've",
            'couldve': "could've",
            'mightve': "might've",
            'mustve': "must've",
            'youre': "you're",
            'theyre': "they're",
            'were': "we're",
            'its': "it's",
            'lets': "let's",
            'thats': "that's",
            'whats': "what's",
            'heres': "here's",
            'theres': "there's",
            'wheres': "where's"
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
                'gotta': 'have to',
                'kinda': 'kind of',
                'sorta': 'sort of'
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
            "mightn't": 'might not',
            "mustn't": 'must not',
            "would've": 'would have',
            "should've": 'should have',
            "could've": 'could have',
            "might've": 'might have',
            "must've": 'must have',
            "you're": 'you are',
            "they're": 'they are',
            "we're": 'we are',
            "it's": 'it is',
            "let's": 'let us',
            "that's": 'that is',
            "what's": 'what is',
            "here's": 'here is',
            "there's": 'there is',
            "where's": 'where is',
            "I'll": 'I will',
            "you'll": 'you will',
            "he'll": 'he will',
            "she'll": 'she will',
            "we'll": 'we will',
            "they'll": 'they will',
            "I'd": 'I would',
            "you'd": 'you would',
            "he'd": 'he would',
            "she'd": 'she would',
            "we'd": 'we would',
            "they'd": 'they would',
            "I've": 'I have',
            "you've": 'you have',
            "we've": 'we have',
            "they've": 'they have'
        };

        let processed = text;
        for (const [contraction, expanded] of Object.entries(contractions)) {
            const regex = new RegExp(contraction.replace(/'/g, "'"), 'gi');
            processed = processed.replace(regex, expanded);
        }

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
        processed = processed.replace(/(\n)([a-z])/g, (match, p1, p2) => {
            return p1 + p2.toUpperCase();
        });

        return processed;
    }

    /**
     * Detect context from text or environment
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

        // Check for casual indicators
        if (/hey|hi|sup|wassup|lol|omg|btw/i.test(text)) {
            return 'casual';
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
            'casual': 'casual',
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

        // Learn common corrections
        if (original !== processed) {
            const key = original.toLowerCase();
            if (!this.userPreferences.patterns[key]) {
                this.userPreferences.patterns[key] = {};
            }
            
            if (!this.userPreferences.patterns[key][processed]) {
                this.userPreferences.patterns[key][processed] = 0;
            }
            
            this.userPreferences.patterns[key][processed]++;
        }

        // Save preferences periodically
        this.saveUserPreferences();
    }

    /**
     * Load user preferences from storage
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
     * Save user preferences to storage
     */
    saveUserPreferences() {
        try {
            localStorage.setItem('voiceTextPreferences', JSON.stringify(this.userPreferences));
        } catch (error) {
            console.error('Error saving voice text preferences:', error);
        }
    }

    /**
     * Add custom voice command
     */
    addCustomCommand(phrase, replacement) {
        this.voiceCommands[phrase.toLowerCase()] = replacement;
        
        if (!this.userPreferences.customCommands) {
            this.userPreferences.customCommands = {};
        }
        
        this.userPreferences.customCommands[phrase.toLowerCase()] = replacement;
        this.saveUserPreferences();
    }

    /**
     * Set default tone
     */
    setDefaultTone(tone) {
        if (this.toneSettings[tone]) {
            this.userPreferences.defaultTone = tone;
            this.saveUserPreferences();
        }
    }

    /**
     * Toggle filler word removal
     */
    toggleFillerRemoval(enabled) {
        this.userPreferences.removeFiller = enabled;
        this.saveUserPreferences();
    }
}

// Export as singleton
module.exports = new VoiceTextProcessor();