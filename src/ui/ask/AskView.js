import { html, css, LitElement } from '../../ui/assets/lit-core-2.7.4.min.js';
import { parser, parser_write, parser_end, default_renderer } from '../../ui/assets/smd.js';

// Voice text processor for advanced formatting
import { voiceTextProcessor } from './voiceTextProcessor.js';

export class AskView extends LitElement {
    static properties = {
        currentResponse: { type: String },
        currentQuestion: { type: String },
        isLoading: { type: Boolean },
        copyState: { type: String },
        isHovering: { type: Boolean },
        hoveredLineIndex: { type: Number },
        lineCopyState: { type: Object },
        showTextInput: { type: Boolean },
        headerText: { type: String },
        headerAnimating: { type: Boolean },
        isStreaming: { type: Boolean },
        isRecording: { type: Boolean },
        micPermission: { type: String },
    };

    static styles = css`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            color: white;
            transform: translate3d(0, 0, 0);
            backface-visibility: hidden;
            transition: transform 0.2s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.2s ease-out;
            will-change: transform, opacity;
        }

        :host(.hiding) {
            animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.6, 1) forwards;
        }

        :host(.showing) {
            animation: slideDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        :host(.hidden) {
            opacity: 0;
            transform: translateY(-150%) scale(0.85);
            pointer-events: none;
        }

        @keyframes slideUp {
            0% {
                opacity: 1;
                transform: translateY(0) scale(1);
                filter: blur(0px);
            }
            30% {
                opacity: 0.7;
                transform: translateY(-20%) scale(0.98);
                filter: blur(0.5px);
            }
            70% {
                opacity: 0.3;
                transform: translateY(-80%) scale(0.92);
                filter: blur(1.5px);
            }
            100% {
                opacity: 0;
                transform: translateY(-150%) scale(0.85);
                filter: blur(2px);
            }
        }

        @keyframes slideDown {
            0% {
                opacity: 0;
                transform: translateY(-150%) scale(0.85);
                filter: blur(2px);
            }
            30% {
                opacity: 0.5;
                transform: translateY(-50%) scale(0.92);
                filter: blur(1px);
            }
            65% {
                opacity: 0.9;
                transform: translateY(-5%) scale(0.99);
                filter: blur(0.2px);
            }
            85% {
                opacity: 0.98;
                transform: translateY(2%) scale(1.005);
                filter: blur(0px);
            }
            100% {
                opacity: 1;
                transform: translateY(0) scale(1);
                filter: blur(0px);
            }
        }

        * {
            font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            cursor: default;
            user-select: none;
        }

        /* Allow text selection in assistant responses */
        .response-container, .response-container * {
            user-select: text !important;
            cursor: text !important;
        }

        .response-container pre {
            background: rgba(0, 0, 0, 0.4) !important;
            border-radius: 8px !important;
            padding: 12px !important;
            margin: 8px 0 !important;
            overflow-x: auto !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            white-space: pre !important;
            word-wrap: normal !important;
            word-break: normal !important;
        }

        .response-container code {
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace !important;
            font-size: 11px !important;
            background: transparent !important;
            white-space: pre !important;
            word-wrap: normal !important;
            word-break: normal !important;
        }

        .response-container pre code {
            white-space: pre !important;
            word-wrap: normal !important;
            word-break: normal !important;
            display: block !important;
        }

        .response-container p code {
            background: rgba(255, 255, 255, 0.1) !important;
            padding: 2px 4px !important;
            border-radius: 3px !important;
            color: #ffd700 !important;
        }

        .hljs-keyword {
            color: #ff79c6 !important;
        }
        .hljs-string {
            color: #f1fa8c !important;
        }
        .hljs-comment {
            color: #6272a4 !important;
        }
        .hljs-number {
            color: #bd93f9 !important;
        }
        .hljs-function {
            color: #50fa7b !important;
        }
        .hljs-variable {
            color: #8be9fd !important;
        }
        .hljs-built_in {
            color: #ffb86c !important;
        }
        .hljs-title {
            color: #50fa7b !important;
        }
        .hljs-attr {
            color: #50fa7b !important;
        }
        .hljs-tag {
            color: #ff79c6 !important;
        }

        .ask-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
            background: rgba(0, 0, 0, 0.6);
            border-radius: 12px;
            outline: 0.5px rgba(255, 255, 255, 0.3) solid;
            outline-offset: -1px;
            backdrop-filter: blur(1px);
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
        }

        .ask-container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.15);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            filter: blur(10px);
            z-index: -1;
        }

        .response-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: transparent;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            flex-shrink: 0;
        }

        .response-header.hidden {
            display: none;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }

        .response-icon {
            width: 20px;
            height: 20px;
            background: #000;
            border: 0.5px solid rgba(255, 255, 255, 0.08);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            position: relative;
            overflow: hidden;
            box-shadow: 
                0 0 0 0.5px rgba(255, 255, 255, 0.04),
                inset 0 0.5px 0 rgba(255, 255, 255, 0.06),
                0 1px 2px rgba(0, 0, 0, 0.2);
        }

        .response-icon .response-stars {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            overflow: hidden;
        }

        .response-star {
            position: absolute;
            background: white;
            border-radius: 50%;
            opacity: 0.8;
        }

        .response-star.twinkle {
            animation: response-twinkle 3s ease-in-out infinite;
        }

        .response-star.slow {
            animation: response-float-slow 8s ease-in-out infinite;
        }

        .response-star.medium {
            animation: response-float-medium 6s ease-in-out infinite;
        }

        .response-star.fast {
            animation: response-float-fast 4s ease-in-out infinite;
        }

        @keyframes response-twinkle {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
        }

        @keyframes response-float-slow {
            0%, 100% { transform: translate(0, 0); }
            25% { transform: translate(0.5px, -0.5px); }
            50% { transform: translate(-0.5px, 0.5px); }
            75% { transform: translate(0.5px, 0.5px); }
        }

        @keyframes response-float-medium {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(-0.5px, -0.5px); }
            66% { transform: translate(0.5px, -0.5px); }
        }

        @keyframes response-float-fast {
            0%, 100% { transform: translate(0, 0); }
            50% { transform: translate(0.25px, -0.25px); }
        }

        /* Orbiting dot for response icon */
        .response-orbit-dot {
            position: absolute;
            width: 2px;
            height: 2px;
            background: white;
            border-radius: 50%;
            opacity: 0.9;
            animation: response-orbit 15s linear infinite;
            pointer-events: none;
            box-shadow: 0 0 3px rgba(255, 255, 255, 0.5);
        }

        @keyframes response-orbit {
            0% {
                transform: rotate(0deg) translateX(12px) translateY(0) rotate(0deg);
            }
            100% {
                transform: rotate(360deg) translateX(12px) translateY(0) rotate(-360deg);
            }
        }

        .response-label {
            font-size: 13px;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.9);
            white-space: nowrap;
            position: relative;
            overflow: hidden;
        }

        .response-label.animating {
            animation: fadeInOut 0.3s ease-in-out;
        }

        @keyframes fadeInOut {
            0% {
                opacity: 1;
                transform: translateY(0);
            }
            50% {
                opacity: 0;
                transform: translateY(-10px);
            }
            100% {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .header-right {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            justify-content: flex-end;
        }

        .question-text {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.7);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 300px;
            margin-right: 8px;
        }

        .header-controls {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-shrink: 0;
        }

        .copy-button {
            background: transparent;
            color: rgba(255, 255, 255, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.2);
            padding: 4px;
            border-radius: 3px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 24px;
            height: 24px;
            flex-shrink: 0;
            transition: background-color 0.15s ease;
            position: relative;
            overflow: hidden;
        }

        .copy-button:hover {
            background: rgba(255, 255, 255, 0.15);
        }

        .copy-button svg {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
        }

        .copy-button .check-icon {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
        }

        .copy-button.copied .copy-icon {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
        }

        .copy-button.copied .check-icon {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }

        .close-button {
            background: rgba(255, 255, 255, 0.07);
            color: white;
            border: none;
            padding: 4px;
            border-radius: 20px;
            outline: 1px rgba(255, 255, 255, 0.3) solid;
            outline-offset: -1px;
            backdrop-filter: blur(0.5px);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
        }

        .close-button:hover {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 1);
        }

        .response-container {
            flex: 1;
            padding: 16px;
            padding-left: 48px;
            overflow-y: auto;
            font-size: 14px;
            line-height: 1.6;
            background: transparent;
            min-height: 0;
            max-height: 400px;
            position: relative;
        }

        .response-container.hidden {
            display: none;
        }

        .response-container::-webkit-scrollbar {
            width: 6px;
        }

        .response-container::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 3px;
        }

        .response-container::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 3px;
        }

        .response-container::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .loading-container {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px;
            position: relative;
        }

        .loading-orbit {
            position: relative;
            width: 60px;
            height: 60px;
        }

        .loading-orbit-dot {
            position: absolute;
            width: 4px;
            height: 4px;
            background: rgba(255, 255, 255, 0.9);
            border-radius: 50%;
            top: 50%;
            left: 50%;
            margin-top: -2px;
            margin-left: -2px;
            animation: ask-loading-orbit 2s linear infinite;
            box-shadow: 0 0 6px rgba(255, 255, 255, 0.5);
        }

        .loading-orbit-dot:nth-child(1) {
            animation-delay: 0s;
            opacity: 1;
        }

        .loading-orbit-dot:nth-child(2) {
            animation-delay: 0.66s;
            opacity: 0.7;
        }

        .loading-orbit-dot:nth-child(3) {
            animation-delay: 1.33s;
            opacity: 0.4;
        }

        @keyframes ask-loading-orbit {
            0% {
                transform: rotate(0deg) translateX(25px) translateY(0) rotate(0deg);
            }
            100% {
                transform: rotate(360deg) translateX(25px) translateY(0) rotate(-360deg);
            }
        }

        @keyframes pulse {
            0%,
            80%,
            100% {
                opacity: 0.3;
                transform: scale(0.8);
            }
            40% {
                opacity: 1;
                transform: scale(1.2);
            }
        }

        .response-line {
            position: relative;
            padding: 2px 0;
            margin: 0;
            transition: background-color 0.15s ease;
        }

        .response-line:hover {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
        }

        .line-copy-button {
            position: absolute;
            left: -32px;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 3px;
            padding: 2px;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.15s ease, background-color 0.15s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
        }

        .response-line:hover .line-copy-button {
            opacity: 1;
        }

        .line-copy-button:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .line-copy-button.copied {
            background: rgba(40, 167, 69, 0.3);
        }

        .line-copy-button svg {
            width: 12px;
            height: 12px;
            stroke: rgba(255, 255, 255, 0.9);
        }

        .text-input-container {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 16px;
            background: rgba(0, 0, 0, 0.1);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            flex-shrink: 0;
            transition: opacity 0.1s ease-in-out, transform 0.1s ease-in-out;
            transform-origin: bottom;
        }

        .text-input-container.hidden {
            opacity: 0;
            transform: scaleY(0);
            padding: 0;
            height: 0;
            overflow: hidden;
            border-top: none;
        }

        .text-input-container.no-response {
            border-top: none;
        }

        #textInput {
            flex: 1;
            padding: 10px 14px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 20px;
            outline: none;
            border: none;
            color: white;
            font-size: 14px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 400;
        }

        #textInput::placeholder {
            color: rgba(255, 255, 255, 0.5);
        }

        #textInput:focus {
            outline: none;
        }

        .response-line h1,
        .response-line h2,
        .response-line h3,
        .response-line h4,
        .response-line h5,
        .response-line h6 {
            color: rgba(255, 255, 255, 0.95);
            margin: 16px 0 8px 0;
            font-weight: 600;
        }

        .response-line p {
            margin: 8px 0;
            color: rgba(255, 255, 255, 0.9);
        }

        .response-line ul,
        .response-line ol {
            margin: 8px 0;
            padding-left: 20px;
        }

        .response-line li {
            margin: 4px 0;
            color: rgba(255, 255, 255, 0.9);
        }

        .response-line code {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.95);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 13px;
        }

        .response-line pre {
            background: rgba(255, 255, 255, 0.05);
            color: rgba(255, 255, 255, 0.95);
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 12px 0;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .response-line pre code {
            background: none;
            padding: 0;
        }

        .response-line blockquote {
            border-left: 3px solid rgba(255, 255, 255, 0.3);
            margin: 12px 0;
            padding: 8px 16px;
            background: rgba(255, 255, 255, 0.05);
            color: rgba(255, 255, 255, 0.8);
        }

        .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: rgba(255, 255, 255, 0.5);
            font-size: 14px;
        }

        .btn-gap {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 4px;
        }

        /* ────────────────[ GLASS BYPASS ]─────────────── */
        :host-context(body.has-glass) .ask-container,
        :host-context(body.has-glass) .response-header,
        :host-context(body.has-glass) .response-icon,
        :host-context(body.has-glass) .copy-button,
        :host-context(body.has-glass) .close-button,
        :host-context(body.has-glass) .line-copy-button,
        :host-context(body.has-glass) .text-input-container,
        :host-context(body.has-glass) .response-container pre,
        :host-context(body.has-glass) .response-container p code,
        :host-context(body.has-glass) .response-container pre code {
            background: transparent !important;
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            filter: none !important;
            backdrop-filter: none !important;
        }

        :host-context(body.has-glass) .ask-container::before {
            display: none !important;
        }

        :host-context(body.has-glass) .copy-button:hover,
        :host-context(body.has-glass) .close-button:hover,
        :host-context(body.has-glass) .line-copy-button,
        :host-context(body.has-glass) .line-copy-button:hover,
        :host-context(body.has-glass) .response-line:hover {
            background: transparent !important;
        }

        :host-context(body.has-glass) .response-container::-webkit-scrollbar-track,
        :host-context(body.has-glass) .response-container::-webkit-scrollbar-thumb {
            background: transparent !important;
        }

        .submit-btn, .clear-btn {
            display: flex;
            align-items: center;
            background: transparent;
            color: white;
            border: none;
            border-radius: 6px;
            margin-left: 8px;
            font-size: 13px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 500;
            overflow: hidden;
            cursor: pointer;
            transition: background 0.15s;
            height: 32px;
            padding: 0 10px;
            box-shadow: none;
            flex-shrink: 0;
            position: relative;
            z-index: 10;
            pointer-events: all;
        }
        .submit-btn:hover, .clear-btn:hover {
            background: rgba(255,255,255,0.1);
        }
        .btn-label {
            margin-right: 8px;
            display: flex;
            align-items: center;
            height: 100%;
        }
        .btn-icon {
            background: rgba(255,255,255,0.1);
            border-radius: 13%;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
        }
        .btn-icon img, .btn-icon svg {
            width: 13px;
            height: 13px;
            display: block;
        }
        .header-clear-btn {
            background: transparent;
            border: none;
            display: flex;
            align-items: center;
            gap: 2px;
            cursor: pointer;
            padding: 0 2px;
        }
        .header-clear-btn .icon-box {
            color: white;
            font-size: 12px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 500;
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 13%;
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .header-clear-btn:hover .icon-box {
            background-color: rgba(255,255,255,0.18);
        }

        .suggestions-container {
            padding: 8px 16px 12px 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(0, 0, 0, 0.05);
        }

        .suggestions-container.hidden {
            display: none;
        }

        .suggestions-label {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.6);
            font-weight: 500;
            margin-bottom: 4px;
        }

        .suggestions-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .suggestion-button {
            background: transparent;
            border: none;
            border-radius: 9000px;
            padding: 6px 12px;
            color: white;
            font-size: 12px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s ease;
            user-select: none;
            white-space: nowrap;
            position: relative;
        }

        .suggestion-button::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            border-radius: 9000px;
            z-index: -1;
            transition: background 0.15s ease;
        }

        .suggestion-button::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border-radius: 9000px;
            padding: 1px;
            background: linear-gradient(169deg, rgba(255, 255, 255, 0.17) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.17) 100%);
            -webkit-mask:
                linear-gradient(#fff 0 0) content-box,
                linear-gradient(#fff 0 0);
            -webkit-mask-composite: destination-out;
            mask-composite: exclude;
            pointer-events: none;
        }

        .suggestion-button:hover::before {
            background: rgba(0, 0, 0, 0.7);
        }

        .suggestion-button:active {
            transform: translateY(0);
        }

        .input-with-mic {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
        }

        .mic-button {
            width: 32px;
            height: 32px;
            border: none;
            border-radius: 9000px;
            background: transparent;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.15s ease;
            position: relative;
            flex-shrink: 0;
        }

        .mic-button::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            border-radius: 9000px;
            z-index: -1;
            transition: background 0.15s ease;
        }

        .mic-button::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border-radius: 9000px;
            padding: 1px;
            background: linear-gradient(169deg, rgba(255, 255, 255, 0.17) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.17) 100%);
            -webkit-mask:
                linear-gradient(#fff 0 0) content-box,
                linear-gradient(#fff 0 0);
            -webkit-mask-composite: destination-out;
            mask-composite: exclude;
            pointer-events: none;
        }

        .mic-button:hover::before {
            background: rgba(0, 0, 0, 0.7);
        }

        .mic-button.recording::before {
            background: rgba(215, 0, 0, 0.6);
        }

        .mic-button.recording:hover::before {
            background: rgba(255, 20, 20, 0.7);
        }

        .mic-button svg {
            width: 16px;
            height: 16px;
            fill: white !important;
            color: white !important;
        }

        .mic-button.recording svg {
            animation: pulse 1s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }

        .text-input-container input {
            flex: 1;
        }

        .conversation-history {
            max-height: 300px;
            overflow-y: auto;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            margin-bottom: 8px;
        }

        .conversation-message {
            margin-bottom: 12px;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 13px;
            line-height: 1.4;
        }

        .message-user {
            background: rgba(255, 255, 255, 0.08);
            color: rgba(255, 255, 255, 0.9);
            margin-left: 20px;
            text-align: right;
        }

        .message-assistant {
            background: rgba(0, 0, 0, 0.2);
            color: rgba(255, 255, 255, 0.8);
            margin-right: 20px;
        }

        /* Follow-up Input Styles */
        .followup-container {
            margin-top: 12px;
            padding: 0 16px 16px;
        }

        .followup-input-wrapper {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .followup-input {
            flex: 1;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: white;
            font-size: 13px;
            outline: none;
            transition: all 0.15s ease;
        }

        .followup-input:focus {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.2);
        }

        .followup-input::placeholder {
            color: rgba(255, 255, 255, 0.5);
        }

        .followup-submit {
            width: 32px;
            height: 32px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
        }

        .followup-submit:hover {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.2);
        }

        /* Inline Action Buttons in Response Content */
        .response-container .inline-action-button {
            background: transparent;
            border: none;
            border-radius: 8px;
            padding: 8px 12px;
            color: white;
            font-size: 14px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 400;
            cursor: pointer;
            transition: all 0.15s ease;
            user-select: none;
            text-align: left;
            position: relative;
            line-height: 1.4;
            margin: 4px 0;
            display: inline-block;
            width: 100%;
            min-height: 36px;
        }

        .response-container .inline-action-button::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 8px;
            z-index: -1;
            transition: background 0.15s ease;
        }

        .response-container .inline-action-button::after {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            border-radius: 8px;
            padding: 1px;
            background: linear-gradient(169deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 50%, rgba(255, 255, 255, 0.12) 100%);
            -webkit-mask:
                linear-gradient(#fff 0 0) content-box,
                linear-gradient(#fff 0 0);
            -webkit-mask-composite: destination-out;
            mask-composite: exclude;
            pointer-events: none;
        }

        .response-container .inline-action-button:hover::before {
            background: rgba(0, 0, 0, 0.5);
        }

        .response-container .inline-action-button:active {
            transform: translateY(1px);
        }

    `;

    constructor() {
        super();
        console.log('🎯 AskView constructor starting...');
        this.currentResponse = '';
        this.currentQuestion = '';
        this.isLoading = false;
        this.copyState = 'idle';
        this.showTextInput = true;
        this.headerText = 'AI Response';
        this.headerAnimating = false;
        this.isStreaming = false;
        this.isRecording = false;
        this.micPermission = 'unknown';
        this.audioCapture = null;
        this.sttListener = null;
        console.log('🎯 AskView constructor completed');


        this.marked = null;
        this.hljs = null;
        this.DOMPurify = null;
        this.isLibrariesLoaded = false;

        // SMD.js streaming markdown parser
        this.smdParser = null;
        this.smdContainer = null;
        this.lastProcessedLength = 0;

        this.handleSendText = this.handleSendText.bind(this);
        this.handleTextKeydown = this.handleTextKeydown.bind(this);
        this.handleCopy = this.handleCopy.bind(this);
        this.clearResponseContent = this.clearResponseContent.bind(this);
        this.handleEscKey = this.handleEscKey.bind(this);
        this.handleScroll = this.handleScroll.bind(this);
        this.handleCloseAskWindow = this.handleCloseAskWindow.bind(this);
        this.handleCloseIfNoContent = this.handleCloseIfNoContent.bind(this);
        this.handleSuggestionClick = this.handleSuggestionClick.bind(this);
        this.handleMicClick = this.handleMicClick.bind(this);
        this.initializeMicrophone = this.initializeMicrophone.bind(this);
        this.handleActionButtonClick = this.handleActionButtonClick.bind(this);

        this.suggestions = [
            "Explain what's on my screen",
            "Fill out this form for me",
            "Draft an email response",
            "Create a Google Sheets template",
            "Fill spreadsheet with customer data",
            "Extract text from this page"
        ];

        this.loadLibraries();

        // --- Resize helpers ---
        this.isThrottled = false;
    }

    connectedCallback() {
        super.connectedCallback();

        console.log('📱 AskView connectedCallback - IPC 이벤트 리스너 설정');

        document.addEventListener('keydown', this.handleEscKey);

        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const needed = entry.contentRect.height;
                const current = window.innerHeight;

                if (needed > current - 4) {
                    this.requestWindowResize(Math.ceil(needed));
                }
            }
        });

        const container = this.shadowRoot?.querySelector('.ask-container');
        if (container) this.resizeObserver.observe(container);

        this.handleQuestionFromAssistant = (event, question) => {
            console.log('AskView: Received question from ListenView:', question);
            this.handleSendText(null, question);
        };

        if (window.api) {
            window.api.askView.onShowTextInput(() => {
                console.log('Show text input signal received');
                if (!this.showTextInput) {
                    this.showTextInput = true;
                    this.updateComplete.then(() => this.focusTextInput());
                  } else {
                    this.focusTextInput();
                  }
            });

            window.api.askView.onScrollResponseUp(() => this.handleScroll('up'));
            window.api.askView.onScrollResponseDown(() => this.handleScroll('down'));
            window.api.askView.onAskStateUpdate((event, newState) => {
                console.log('🔄 onAskStateUpdate triggered. Loading:', newState.isLoading, 'Streaming:', newState.isStreaming);
                
                // Check if we just finished streaming to save conversation
                const wasStreaming = this.isStreaming;
                const wasLoading = this.isLoading;
                const previousResponse = this.currentResponse;
                
                this.currentResponse = newState.currentResponse;
                this.currentQuestion = newState.currentQuestion;
                this.isLoading       = newState.isLoading;
                this.isStreaming     = newState.isStreaming;
              
                console.log('🔄 State updated. Previous response length:', previousResponse?.length || 0, 'New response length:', this.currentResponse?.length || 0);
                
                // Add AI response to conversation history when response is completed
                if (previousResponse !== this.currentResponse && this.currentResponse && !this.isLoading && !this.isStreaming) {
                    console.log('🤖 Conditions met for adding AI response to history');
                    // Check if this response is already in history to avoid duplicates
                    const lastMessage = this.conversationHistory[this.conversationHistory.length - 1];
                    if (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.content !== this.currentResponse) {
                        this.conversationHistory.push({
                            role: 'assistant',
                            content: this.currentResponse,
                            timestamp: Date.now()
                        });
                        console.log('🤖 Added AI response to conversation history. Total messages:', this.conversationHistory.length);
                        console.log('🤖 Full conversation history:', this.conversationHistory);
                        
                        // Parse action buttons from the completed response
                        console.log('🎯 Parsing action buttons from response:', this.currentResponse.substring(0, 200) + '...');
                        this.actionButtons = this.parseActionButtons(this.currentResponse);
                        console.log('🎯 Found', this.actionButtons.length, 'action buttons');
                    } else {
                        console.log('🤖 AI response already in history, skipping duplicate');
                    }
                } else {
                    console.log('🤖 Conditions NOT met for adding AI response. Response changed:', previousResponse !== this.currentResponse, 'Has response:', !!this.currentResponse, 'Not loading:', !this.isLoading, 'Not streaming:', !this.isStreaming);
                }
              
                // Response streaming/loading completed
                
                const wasHidden = !this.showTextInput;
                this.showTextInput = newState.showTextInput;
              
                if (newState.showTextInput) {
                  if (wasHidden) {
                    this.updateComplete.then(() => this.focusTextInput());
                  } else {
                    this.focusTextInput();
                  }
                }
              });
            console.log('AskView: IPC 이벤트 리스너 등록 완료');
        }

        // Initialize microphone and voice text processor when component is ready
        setTimeout(() => {
            this.initializeMicrophone();
            this.initializeVoiceTextProcessor();
        }, 100);

        // Add message listener for action buttons
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'action-button') {
                this.handleActionButtonClick(event.data.text);
            }
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.resizeObserver?.disconnect();

        console.log('📱 AskView disconnectedCallback - IPC 이벤트 리스너 제거');

        document.removeEventListener('keydown', this.handleEscKey);

        if (this.copyTimeout) {
            clearTimeout(this.copyTimeout);
        }

        if (this.headerAnimationTimeout) {
            clearTimeout(this.headerAnimationTimeout);
        }

        if (this.streamingTimeout) {
            clearTimeout(this.streamingTimeout);
        }

        Object.values(this.lineCopyTimeouts).forEach(timeout => clearTimeout(timeout));

        // Clean up STT listener
        if (this.sttListener && window.api && window.api.sttView) {
            window.api.sttView.removeOnSttUpdate(this.sttListener);
            this.sttListener = null;
        }
        
        // Stop recording if active
        if (this.isRecording) {
            this.stopRecording();
        }

        if (window.api) {
            window.api.askView.removeOnAskStateUpdate(this.handleAskStateUpdate);
            window.api.askView.removeOnShowTextInput(this.handleShowTextInput);
            window.api.askView.removeOnScrollResponseUp(this.handleScroll);
            window.api.askView.removeOnScrollResponseDown(this.handleScroll);
            console.log('✅ AskView: IPC 이벤트 리스너 제거 필요');
        }
    }


    async loadLibraries() {
        try {
            if (!window.marked) {
                await this.loadScript('../../assets/marked-4.3.0.min.js');
            }

            if (!window.hljs) {
                await this.loadScript('../../assets/highlight-11.9.0.min.js');
            }

            if (!window.DOMPurify) {
                await this.loadScript('../../assets/dompurify-3.0.7.min.js');
            }

            this.marked = window.marked;
            this.hljs = window.hljs;
            this.DOMPurify = window.DOMPurify;

            if (this.marked && this.hljs) {
                this.marked.setOptions({
                    highlight: (code, lang) => {
                        if (lang && this.hljs.getLanguage(lang)) {
                            try {
                                return this.hljs.highlight(code, { language: lang }).value;
                            } catch (err) {
                                console.warn('Highlight error:', err);
                            }
                        }
                        try {
                            return this.hljs.highlightAuto(code).value;
                        } catch (err) {
                            console.warn('Auto highlight error:', err);
                        }
                        return code;
                    },
                    breaks: true,
                    gfm: true,
                    pedantic: false,
                    smartypants: false,
                    xhtml: false,
                });

                this.isLibrariesLoaded = true;
                this.renderContent();
                console.log('Markdown libraries loaded successfully in AskView');
            }

            if (this.DOMPurify) {
                this.isDOMPurifyLoaded = true;
                console.log('DOMPurify loaded successfully in AskView');
            }
        } catch (error) {
            console.error('Failed to load libraries in AskView:', error);
        }
    }

    handleCloseAskWindow() {
        // this.clearResponseContent();
        window.api.askView.closeAskWindow();
    }

    handleCloseIfNoContent() {
        if (!this.currentResponse && !this.isLoading && !this.isStreaming) {
            this.handleCloseAskWindow();
        }
    }

    handleEscKey(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.handleCloseIfNoContent();
        }
    }

    clearResponseContent() {
        this.currentResponse = '';
        this.currentQuestion = '';
        this.isLoading = false;
        this.isStreaming = false;
        this.headerText = 'AI Response';
        this.showTextInput = true;
        this.lastProcessedLength = 0;
        this.smdParser = null;
        this.smdContainer = null;
    }


    handleInputFocus() {
        this.isInputFocused = true;
    }

    focusTextInput() {
        requestAnimationFrame(() => {
            const textInput = this.shadowRoot?.getElementById('textInput');
            if (textInput) {
                textInput.focus();
            }
        });
    }


    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    parseMarkdown(text) {
        if (!text) return '';

        if (!this.isLibrariesLoaded || !this.marked) {
            return text;
        }

        try {
            return this.marked(text);
        } catch (error) {
            console.error('Markdown parsing error in AskView:', error);
            return text;
        }
    }

    fixIncompleteCodeBlocks(text) {
        if (!text) return text;

        const codeBlockMarkers = text.match(/```/g) || [];
        const markerCount = codeBlockMarkers.length;

        if (markerCount % 2 === 1) {
            return text + '\n```';
        }

        return text;
    }

    handleScroll(direction) {
        const scrollableElement = this.shadowRoot.querySelector('#responseContainer');
        if (scrollableElement) {
            const scrollAmount = 100; // 한 번에 스크롤할 양 (px)
            if (direction === 'up') {
                scrollableElement.scrollTop -= scrollAmount;
            } else {
                scrollableElement.scrollTop += scrollAmount;
            }
        }
    }


    renderContent() {
        const responseContainer = this.shadowRoot.getElementById('responseContainer');
        if (!responseContainer) return;
    
        // Check loading state
        if (this.isLoading) {
            responseContainer.innerHTML = `
              <div class="loading-container">
                <div class="loading-orbit">
                  <div class="loading-orbit-dot"></div>
                  <div class="loading-orbit-dot"></div>
                  <div class="loading-orbit-dot"></div>
                </div>
              </div>`;
            this.resetStreamingParser();
            return;
        }
        
        // If there is no response, show empty state
        if (!this.currentResponse) {
            responseContainer.innerHTML = `<div class="empty-state">...</div>`;
            this.resetStreamingParser();
            return;
        }
        
        // Set streaming markdown parser
        this.renderStreamingMarkdown(responseContainer);

        // After updating content, recalculate window height
        this.adjustWindowHeightThrottled();
    }

    resetStreamingParser() {
        this.smdParser = null;
        this.smdContainer = null;
        this.lastProcessedLength = 0;
    }

    renderStreamingMarkdown(responseContainer) {
        try {
            // 파서가 없거나 컨테이너가 변경되었으면 새로 생성
            if (!this.smdParser || this.smdContainer !== responseContainer) {
                this.smdContainer = responseContainer;
                this.smdContainer.innerHTML = '';
                
                // smd.js의 default_renderer 사용
                const renderer = default_renderer(this.smdContainer);
                this.smdParser = parser(renderer);
                this.lastProcessedLength = 0;
            }

            // 새로운 텍스트만 처리 (스트리밍 최적화)
            const currentText = this.currentResponse;
            const newText = currentText.slice(this.lastProcessedLength);
            
            if (newText.length > 0) {
                // 새로운 텍스트 청크를 파서에 전달
                parser_write(this.smdParser, newText);
                this.lastProcessedLength = currentText.length;
            }

            // 스트리밍이 완료되면 파서 종료
            if (!this.isStreaming && !this.isLoading) {
                parser_end(this.smdParser);
                // Convert button placeholders to actual buttons after streaming is complete
                this.convertButtonPlaceholders(responseContainer);
            }

            // 코드 하이라이팅 적용
            if (this.hljs) {
                responseContainer.querySelectorAll('pre code').forEach(block => {
                    if (!block.hasAttribute('data-highlighted')) {
                        this.hljs.highlightElement(block);
                        block.setAttribute('data-highlighted', 'true');
                    }
                });
            }

            // 스크롤을 맨 아래로
            responseContainer.scrollTop = responseContainer.scrollHeight;
            
        } catch (error) {
            console.error('Error rendering streaming markdown:', error);
            // 에러 발생 시 기본 텍스트 렌더링으로 폴백
            this.renderFallbackContent(responseContainer);
        }
    }

    renderFallbackContent(responseContainer) {
        const textToRender = this.currentResponse || '';
        
        if (this.isLibrariesLoaded && this.marked && this.DOMPurify) {
            try {
                // 마크다운 파싱
                const parsedHtml = this.marked.parse(textToRender);

                // DOMPurify로 정제
                const cleanHtml = this.DOMPurify.sanitize(parsedHtml, {
                    ALLOWED_TAGS: [
                        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'b', 'em', 'i',
                        'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img', 'table', 'thead',
                        'tbody', 'tr', 'th', 'td', 'hr', 'sup', 'sub', 'del', 'ins',
                    ],
                    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'],
                });

                responseContainer.innerHTML = cleanHtml;

                // 코드 하이라이팅 적용
                if (this.hljs) {
                    responseContainer.querySelectorAll('pre code').forEach(block => {
                        this.hljs.highlightElement(block);
                    });
                }
            } catch (error) {
                console.error('Error in fallback rendering:', error);
                responseContainer.textContent = textToRender;
            }
        } else {
            // 라이브러리가 로드되지 않았을 때 기본 렌더링
            const basicHtml = textToRender
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`([^`]+)`/g, '<code>$1</code>');

            responseContainer.innerHTML = `<p>${basicHtml}</p>`;
        }
    }


    requestWindowResize(targetHeight) {
        if (window.api) {
            window.api.askView.adjustWindowHeight(targetHeight);
        }
    }

    animateHeaderText(text) {
        this.headerAnimating = true;
        this.requestUpdate();

        setTimeout(() => {
            this.headerText = text;
            this.headerAnimating = false;
            this.requestUpdate();
        }, 150);
    }

    startHeaderAnimation() {
        this.animateHeaderText('analyzing screen...');

        if (this.headerAnimationTimeout) {
            clearTimeout(this.headerAnimationTimeout);
        }

        this.headerAnimationTimeout = setTimeout(() => {
            this.animateHeaderText('processing...');
        }, 1500);
    }

    renderResponseStars() {
        const starCount = 15;
        const size = 20;
        const radius = (size / 2) - 1;
        const center = size / 2;
        const stars = [];
        
        for (let i = 0; i < starCount; i++) {
            // Generate random angle and distance from center
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * radius;
            
            // Convert to x, y coordinates
            const x = center + Math.cos(angle) * distance;
            const y = center + Math.sin(angle) * distance;
            
            // Random star properties
            const starSize = Math.random() * 0.3 + 0.15; // 0.15 to 0.45px
            const animationType = ['twinkle', 'slow', 'medium', 'fast'][Math.floor(Math.random() * 4)];
            const delay = Math.random() * 3; // Random animation delay
            
            stars.push(`
                <div 
                    class="response-star ${animationType}"
                    style="
                        left: ${x - starSize/2}px;
                        top: ${y - starSize/2}px;
                        width: ${starSize}px;
                        height: ${starSize}px;
                        animation-delay: ${delay}s;
                    "
                ></div>
            `);
        }
        
        return stars.join('');
    }

    renderMarkdown(content) {
        if (!content) return '';

        if (this.isLibrariesLoaded && this.marked) {
            return this.parseMarkdown(content);
        }

        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
    }

    fixIncompleteMarkdown(text) {
        if (!text) return text;

        // 불완전한 볼드체 처리
        const boldCount = (text.match(/\*\*/g) || []).length;
        if (boldCount % 2 === 1) {
            text += '**';
        }

        // 불완전한 이탤릭체 처리
        const italicCount = (text.match(/(?<!\*)\*(?!\*)/g) || []).length;
        if (italicCount % 2 === 1) {
            text += '*';
        }

        // 불완전한 인라인 코드 처리
        const inlineCodeCount = (text.match(/`/g) || []).length;
        if (inlineCodeCount % 2 === 1) {
            text += '`';
        }

        // 불완전한 링크 처리
        const openBrackets = (text.match(/\[/g) || []).length;
        const closeBrackets = (text.match(/\]/g) || []).length;
        if (openBrackets > closeBrackets) {
            text += ']';
        }

        const openParens = (text.match(/\]\(/g) || []).length;
        const closeParens = (text.match(/\)\s*$/g) || []).length;
        if (openParens > closeParens && text.endsWith('(')) {
            text += ')';
        }

        return text;
    }


    async handleCopy() {
        if (this.copyState === 'copied') return;

        let responseToCopy = this.currentResponse;

        if (this.isDOMPurifyLoaded && this.DOMPurify) {
            const testHtml = this.renderMarkdown(responseToCopy);
            const sanitized = this.DOMPurify.sanitize(testHtml);

            if (this.DOMPurify.removed && this.DOMPurify.removed.length > 0) {
                console.warn('Unsafe content detected, copy blocked');
                return;
            }
        }

        const textToCopy = `Question: ${this.currentQuestion}\n\nAnswer: ${responseToCopy}`;

        try {
            await navigator.clipboard.writeText(textToCopy);
            console.log('Content copied to clipboard');

            this.copyState = 'copied';
            this.requestUpdate();

            if (this.copyTimeout) {
                clearTimeout(this.copyTimeout);
            }

            this.copyTimeout = setTimeout(() => {
                this.copyState = 'idle';
                this.requestUpdate();
            }, 1500);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }

    async handleLineCopy(lineIndex) {
        const originalLines = this.currentResponse.split('\n');
        const lineToCopy = originalLines[lineIndex];

        if (!lineToCopy) return;

        try {
            await navigator.clipboard.writeText(lineToCopy);
            console.log('Line copied to clipboard');

            // '복사됨' 상태로 UI 즉시 업데이트
            this.lineCopyState = { ...this.lineCopyState, [lineIndex]: true };
            this.requestUpdate(); // LitElement에 UI 업데이트 요청

            // 기존 타임아웃이 있다면 초기화
            if (this.lineCopyTimeouts && this.lineCopyTimeouts[lineIndex]) {
                clearTimeout(this.lineCopyTimeouts[lineIndex]);
            }

            // ✨ 수정된 타임아웃: 1.5초 후 '복사됨' 상태 해제
            this.lineCopyTimeouts[lineIndex] = setTimeout(() => {
                const updatedState = { ...this.lineCopyState };
                delete updatedState[lineIndex];
                this.lineCopyState = updatedState;
                this.requestUpdate(); // UI 업데이트 요청
            }, 1500);
        } catch (err) {
            console.error('Failed to copy line:', err);
        }
    }

    async handleSendText(e, overridingText = '') {
        const textInput = this.shadowRoot?.getElementById('textInput');
        const text = (overridingText || textInput?.value || '').trim();
        
        if (textInput) {
            textInput.value = '';
        }

        if (window.api) {
            window.api.askView.sendMessage(text).catch(error => {
                console.error('Error sending text:', error);
            });
        }
    }

    handleSuggestionClick(suggestion) {
        const textInput = this.shadowRoot?.getElementById('textInput');
        if (textInput) {
            textInput.value = suggestion;
            textInput.focus();
        }
    }

    handleActionButtonClick(actionText) {
        console.log('🎯 Action button clicked:', actionText);
        this.handleSendText(null, actionText);
    }

    parseActionButtons(responseText) {
        // Extract action buttons from response text using the new format
        const buttonRegex = /\[ACTION_BUTTON:([^\]]+)\](.*?)\[\/ACTION_BUTTON\]/g;
        const buttons = [];
        let match;
        
        while ((match = buttonRegex.exec(responseText)) !== null) {
            buttons.push({
                action: match[1],
                text: match[2].replace(/\*\*/g, ''), // Remove markdown formatting
                fullMatch: match[0]
            });
        }
        
        return buttons;
    }

    convertButtonPlaceholders(container) {
        // Find all action button markers in the content and convert to actual clickable buttons
        const content = container.innerHTML;
        const buttonRegex = /\[ACTION_BUTTON:([^\]]+)\](.*?)\[\/ACTION_BUTTON\]/g;
        
        let newContent = content.replace(buttonRegex, (match, actionText, buttonText) => {
            // Create a proper button element with click handler
            const buttonId = `action-btn-${Math.random().toString(36).substr(2, 9)}`;
            
            // Store the action text for the click handler
            if (!this.actionButtonHandlers) {
                this.actionButtonHandlers = {};
            }
            this.actionButtonHandlers[buttonId] = actionText;
            
            return `<button class="inline-action-button" id="${buttonId}">${buttonText}</button>`;
        });
        
        if (newContent !== content) {
            container.innerHTML = newContent;
            
            // Add click listeners to the new buttons
            Object.keys(this.actionButtonHandlers || {}).forEach(buttonId => {
                const button = container.querySelector(`#${buttonId}`);
                if (button) {
                    button.addEventListener('click', () => {
                        this.handleActionButtonClick(this.actionButtonHandlers[buttonId]);
                    });
                }
            });
        }
    }


    handleFollowupKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.handleFollowupSubmit();
        }
    }

    handleFollowupSubmit() {
        const followupInput = this.shadowRoot?.getElementById('followupInput');
        if (!followupInput || !followupInput.value.trim()) return;

        const followupText = followupInput.value.trim();
        
        // Create context-aware message with previous response
        const contextMessage = `[CONTEXT]\nPrevious Response: ${this.currentResponse}\n\n[NEW MESSAGE]\n${followupText}`;
        
        console.log('🔄 Follow-up Debug - sending:', contextMessage);
        
        // Clear the follow-up input
        followupInput.value = '';
        
        // Send the follow-up message
        if (window.api) {
            window.api.askView.sendMessage(contextMessage).catch(error => {
                console.error('Error sending follow-up:', error);
            });
        }
    }

    handleTextKeydown(e) {
        // Fix for IME composition issue: Ignore Enter key presses while composing.
        if (e.isComposing) {
            return;
        }

        const isPlainEnter = e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey;
        const isModifierEnter = e.key === 'Enter' && (e.metaKey || e.ctrlKey);

        if (isPlainEnter || isModifierEnter) {
            e.preventDefault();
            this.handleSendText();
        }
    }

    updated(changedProperties) {
        super.updated(changedProperties);
    
        // ✨ isLoading 또는 currentResponse가 변경될 때마다 뷰를 다시 그립니다.
        if (changedProperties.has('isLoading') || changedProperties.has('currentResponse')) {
            this.renderContent();
        }
        
    
        if (changedProperties.has('showTextInput') || changedProperties.has('isLoading') || changedProperties.has('currentResponse')) {
            this.adjustWindowHeightThrottled();
        }
    
        if (changedProperties.has('showTextInput') && this.showTextInput) {
            this.focusTextInput();
        }

        // Populate response icon stars
        this.updateComplete.then(() => {
            const responseStarsContainer = this.shadowRoot?.querySelector('.response-stars');
            if (responseStarsContainer) {
                responseStarsContainer.innerHTML = this.renderResponseStars();
            }
        });
    }

    firstUpdated() {
        setTimeout(() => this.adjustWindowHeight(), 200);
    }


    getTruncatedQuestion(question, maxLength = 30) {
        if (!question) return '';
        if (question.length <= maxLength) return question;
        return question.substring(0, maxLength) + '...';
    }



    render() {
        const hasResponse = this.isLoading || this.currentResponse || this.isStreaming;
        const headerText = this.isLoading ? 'Thinking...' : 'AI Response';

        return html`
            <div class="ask-container">
                <!-- Response Header -->
                <div class="response-header ${!hasResponse ? 'hidden' : ''}">
                    <div class="header-left">
                        <div class="response-icon">
                            <div class="response-orbit-dot"></div>
                            <div class="response-stars"></div>
                        </div>
                        <span class="response-label">${headerText}</span>
                    </div>
                    <div class="header-right">
                        <span class="question-text">${this.getTruncatedQuestion(this.currentQuestion)}</span>
                        <div class="header-controls">
                            <button class="copy-button ${this.copyState === 'copied' ? 'copied' : ''}" @click=${this.handleCopy}>
                                <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                </svg>
                                <svg
                                    class="check-icon"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.5"
                                >
                                    <path d="M20 6L9 17l-5-5" />
                                </svg>
                            </button>
                            <button class="close-button" @click=${this.handleCloseAskWindow}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Response Container -->
                <div class="response-container ${!hasResponse ? 'hidden' : ''}" id="responseContainer">
                    <!-- Content is dynamically generated in updateResponseContent() -->
                </div>


                <!-- Text Input Container -->
                <div class="text-input-container ${!hasResponse ? 'no-response' : ''} ${!this.showTextInput ? 'hidden' : ''}">
                    <div class="input-with-mic">
                        <button
                            class="mic-button ${this.isRecording ? 'recording' : ''}"
                            @click=${this.handleMicClick}
                            title="${this.isRecording ? 'Stop recording' : 'Start voice input'}"
                        >
                            ${this.isRecording 
                                ? html`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="6" y="6" width="12" height="12" rx="2" fill="white"/>
                                </svg>`
                                : html`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="white"/>
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                                    <path d="M12 19v4M8 23h8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                                </svg>`
                            }
                        </button>
                        <input
                            type="text"
                            id="textInput"
                            placeholder="Ask about your screen or audio"
                            @keydown=${this.handleTextKeydown}
                            @focus=${this.handleInputFocus}
                        />
                    </div>
                    <button
                        class="submit-btn"
                        @click=${this.handleSendText}
                    >
                        <span class="btn-label">Submit</span>
                        <span class="btn-icon">
                            ↵
                        </span>
                    </button>
                </div>


                <!-- Suggestions Container -->
                <div class="suggestions-container ${!this.showTextInput || hasResponse ? 'hidden' : ''}">
                    <div class="suggestions-label">Suggestions</div>
                    <div class="suggestions-grid">
                        ${this.suggestions.map(suggestion => html`
                            <button 
                                class="suggestion-button" 
                                @click=${() => this.handleSuggestionClick(suggestion)}
                            >
                                ${suggestion}
                            </button>
                        `)}
                    </div>
                </div>
            </div>
        `;
    }

    // Dynamically resize the BrowserWindow to fit current content
    adjustWindowHeight() {
        if (!window.api) return;

        this.updateComplete.then(() => {
            const headerEl = this.shadowRoot.querySelector('.response-header');
            const responseEl = this.shadowRoot.querySelector('.response-container');
            const inputEl = this.shadowRoot.querySelector('.text-input-container');
            const suggestionsEl = this.shadowRoot.querySelector('.suggestions-container');

            if (!headerEl || !responseEl) return;

            const headerHeight = headerEl.classList.contains('hidden') ? 0 : headerEl.offsetHeight;
            const responseHeight = responseEl.scrollHeight;
            const inputHeight = (inputEl && !inputEl.classList.contains('hidden')) ? inputEl.offsetHeight : 0;
            const suggestionsHeight = (suggestionsEl && !suggestionsEl.classList.contains('hidden')) ? suggestionsEl.offsetHeight : 0;

            const idealHeight = headerHeight + responseHeight + inputHeight + suggestionsHeight;

            const targetHeight = Math.min(700, idealHeight);

            window.api.askView.adjustWindowHeight("ask", targetHeight);

        }).catch(err => console.error('AskView adjustWindowHeight error:', err));
    }

    // Throttled wrapper to avoid excessive IPC spam (executes at most once per 100ms)
    adjustWindowHeightThrottled() {
        if (this.isThrottled) return;

        this.isThrottled = true;
        setTimeout(() => {
            this.adjustWindowHeight();
            this.isThrottled = false;
        }, 100); // Reduced frequency from every frame to every 100ms
    }

    /**
     * Initialize voice text processor
     */
    async initializeVoiceTextProcessor() {
        // The voice text processor is now imported as an ES module
        console.log('🎤 Voice text processor ready');
        return true;
    }

    /**
     * Initialize microphone for Deepgram STT
     */
    async initializeMicrophone() {
        try {
            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.error('🎤 getUserMedia not supported in this browser');
                this.micPermission = 'unsupported';
                return false;
            }

            // Request microphone permission
            console.log('🎤 Requesting microphone permission...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop()); // Stop immediately, we just need permission
            
            this.micPermission = 'granted';
            console.log('🎤 Microphone permission granted');

            // Set up STT event listener to receive transcription results
            console.log('🎤 [Ask Window] Setting up STT listener before starting recording...');
            this.setupSTTListener();
            console.log('🎤 [Ask Window] STT listener setup completed');
            
            return true;
        } catch (error) {
            console.error('🎤 Failed to initialize microphone:', error);
            if (error.name === 'NotAllowedError') {
                this.micPermission = 'denied';
            } else {
                this.micPermission = 'denied';
            }
            return false;
        }
    }

    /**
     * Set up listener for STT transcription results
     */
    setupSTTListener() {
        // Listen for STT updates from the main process
        if (window.api && window.api.sttView) {
            console.log('🎤 [Ask Window] Setting up STT listener for Ask window');
            console.log('🎤 [Ask Window] Available API methods:', Object.keys(window.api));
            console.log('🎤 [Ask Window] STT methods:', Object.keys(window.api.sttView || {}));
            
            // Remove any existing listener to avoid duplicates
            if (this.sttListener) {
                window.api.sttView.removeOnSttUpdate(this.sttListener);
                console.log('🎤 [Ask Window] Removed existing STT listener');
            }
            
            const self = this;
            this.sttListener = function() {
                console.log('🎤 [Ask Window] *** STT EVENT RECEIVED ***');
                console.log('🎤 [Ask Window] Raw arguments:', {
                    argumentsLength: arguments.length,
                    arg0: arguments[0],
                    arg1: arguments[1],
                    allArgs: Array.from(arguments)
                });
                
                // Handle both (event, data) and (data) formats
                const actualData = arguments.length > 1 ? arguments[1] : arguments[0];
                
                console.log('🎤 [Ask Window] Processed event data:', {
                    speaker: actualData?.speaker,
                    text: actualData?.text,
                    isFinal: actualData?.isFinal,
                    isPartial: actualData?.isPartial,
                    isRecording: this.isRecording
                });
                console.log('🎤 [Ask Window] Current component state:', {
                    isRecording: self.isRecording,
                    micPermission: self.micPermission
                });
                
                // Process if:
                // 1. We're currently recording in this Ask window
                // 2. This is from "Me" (the user speaking)  
                // 3. The text is not empty
                // 4. It's either partial (live) or final result
                console.log('🎤 [Ask Window] Checking conditions:', {
                    isRecording: self.isRecording,
                    speakerMatch: actualData?.speaker === 'Me',
                    hasText: !!actualData?.text,
                    conditionsMet: self.isRecording && actualData?.speaker === 'Me' && actualData?.text
                });
                
                if (self.isRecording && actualData?.speaker === 'Me' && actualData?.text) {
                    console.log('🎤 [Ask Window] *** CONDITIONS MET - UPDATING INPUT ***');
                    const input = self.shadowRoot.querySelector('#textInput');
                    console.log('🎤 [Ask Window] Input element found:', !!input);
                    
                    if (input) {
                        // Process text through voice text processor for advanced formatting
                        let processedText = actualData.text;
                        if (actualData.text && voiceTextProcessor) {
                            try {
                                // Use the voice text processor to format the text
                                processedText = voiceTextProcessor.processText(
                                    actualData.text, 
                                    actualData.isPartial || !actualData.isFinal
                                );
                                console.log('🎤 [Ask Window] Text processed:', {
                                    original: actualData.text.substring(0, 30) + '...',
                                    processed: processedText.substring(0, 30) + '...',
                                    isPartial: actualData.isPartial || !actualData.isFinal
                                });
                            } catch (error) {
                                console.error('🎤 [Ask Window] Error processing text:', error);
                                processedText = actualData.text; // Fallback to original text
                            }
                        }
                        
                        console.log('🎤 [Ask Window] Setting input value to:', processedText);
                        // Always update the input with the latest processed text (live or final)
                        input.value = processedText;
                        input.focus();
                        console.log('🎤 [Ask Window] Input value after setting:', input.value);
                        
                        if (actualData.isFinal) {
                            console.log('🎤 [Ask Window] *** FINAL RESULT - WILL STOP RECORDING ***');
                            // Add a brief pause before stopping to catch any additional final results
                            setTimeout(() => {
                                if (self.isRecording) {
                                    self.stopRecording();
                                }
                            }, 500);
                        } else if (actualData.isPartial) {
                            console.log('🎤 [Ask Window] *** PARTIAL RESULT - KEEPING RECORDING ACTIVE ***');
                            // Keep recording for more partial results
                            // Add visual feedback that we're actively transcribing
                            input.style.borderColor = '#4CAF50'; // Green border for live transcription
                        }
                    } else {
                        console.error('🎤 [Ask Window] *** INPUT ELEMENT NOT FOUND ***');
                    }
                } else {
                    console.log('🎤 [Ask Window] STT event filtered out:', {
                        isRecording: self.isRecording,
                        speaker: actualData?.speaker,
                        hasText: !!actualData?.text,
                        isFinal: actualData?.isFinal,
                        isPartial: actualData?.isPartial
                    });
                }
            };
            
            console.log('🎤 [Ask Window] About to register STT listener...');
            window.api.sttView.onSttUpdate(this.sttListener);
            console.log('🎤 [Ask Window] STT listener registered successfully');
            
            // Test if the listener is working by logging this
            console.log('🎤 [Ask Window] Listener function:', typeof this.sttListener);
        } else {
            console.error('🎤 [Ask Window] Failed to set up STT listener - window.api.sttView not available');
        }
    }

    /**
     * Handle microphone button click
     */
    async handleMicClick() {
        console.log('🎤 [Ask Window] Microphone button clicked - using Deepgram STT');
        console.log('🎤 [Ask Window] Current state:', {
            isRecording: this.isRecording,
            micPermission: this.micPermission,
            hasAudioCapture: !!this.audioCapture
        });
        console.log('🎤 [Ask Window] About to check if recording or not...');

        try {
            // Initialize microphone if needed
            if (this.micPermission === 'unknown') {
                console.log('🎤 [Ask Window] Initializing microphone...');
                const initialized = await this.initializeMicrophone();
                if (!initialized) {
                    console.error('🎤 [Ask Window] Failed to initialize microphone');
                    if (this.micPermission === 'denied') {
                        alert('Microphone access is required for voice input. Please enable microphone permissions in your browser settings.');
                    } else if (this.micPermission === 'unsupported') {
                        alert('Microphone access is not supported in this browser.');
                    }
                    return;
                }
            }

            // Check permissions
            if (this.micPermission === 'denied') {
                alert('Microphone access was denied. Please enable microphone permissions in your browser settings.');
                return;
            }

            if (this.micPermission === 'unsupported') {
                alert('Microphone access is not supported in this browser.');
                return;
            }

            if (this.isRecording) {
                // Stop recording
                console.log('🎤 Stopping microphone recording...');
                this.stopRecording();
            } else {
                // Start recording
                console.log('🎤 [Ask Window] Starting microphone recording...');
                // Always set up STT listener before recording
                console.log('🎤 [Ask Window] Setting up STT listener before recording...');
                this.setupSTTListener();
                await this.startRecording();
            }
        } catch (error) {
            console.error('🎤 Unexpected error in handleMicClick:', error);
            this.isRecording = false;
            this.requestUpdate();
        }
    }

    /**
     * Start audio recording and STT
     */
    async startRecording() {
        try {
            // Initialize STT sessions directly for Ask window
            console.log('🎤 Initializing STT sessions for Ask window...');
            const result = await window.api.askView.initializeSTT('en');
            if (!result.success) {
                throw new Error(`Failed to initialize STT: ${result.error}`);
            }
            console.log('🎤 STT sessions initialized successfully');

            // Get microphone stream
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 24000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            console.log('🎤 Got microphone stream, setting up audio processing...');

            // Create audio context and processing chain
            const audioContext = new AudioContext({ sampleRate: 24000 });
            const source = audioContext.createMediaStreamSource(stream);
            
            // Create script processor for capturing audio data
            const processor = audioContext.createScriptProcessor(1024, 1, 1);
            
            processor.onaudioprocess = async (event) => {
                if (!this.isRecording) return;
                
                const inputBuffer = event.inputBuffer;
                const inputData = inputBuffer.getChannelData(0);
                
                // Convert Float32Array to Int16Array
                const int16Array = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    int16Array[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
                }
                
                // Convert to base64
                const buffer = int16Array.buffer;
                const uint8Array = new Uint8Array(buffer);
                const base64 = btoa(String.fromCharCode.apply(null, uint8Array));
                
                // Send to STT service using direct Ask window method
                try {
                    await window.api.askView.sendMicAudio({
                        data: base64,
                        mimeType: 'audio/pcm;rate=24000'
                    });
                } catch (error) {
                    console.error('🎤 Error sending audio to STT:', error);
                }
            };
            
            source.connect(processor);
            processor.connect(audioContext.destination);
            
            // Store references for cleanup
            this.audioCapture = {
                stream,
                audioContext,
                processor,
                source
            };
            
            this.isRecording = true;
            console.log('🎤 [Ask Window] *** RECORDING STATE SET TO TRUE ***');
            console.log('🎤 [Ask Window] Component state after setting recording:', {
                isRecording: this.isRecording,
                micPermission: this.micPermission
            });
            this.requestUpdate();
            console.log('🎤 Recording started successfully');
            
        } catch (error) {
            console.error('🎤 Failed to start recording:', error);
            this.isRecording = false;
            this.requestUpdate();
            
            if (error.name === 'NotAllowedError') {
                alert('Microphone permission was denied. Please enable microphone access.');
            } else {
                alert(`Failed to start voice input: ${error.message}`);
            }
        }
    }

    /**
     * Stop audio recording and cleanup
     */
    async stopRecording() {
        console.log('🎤 Stopping recording...');
        
        this.isRecording = false;
        
        // Reset input border color when recording stops
        const input = this.shadowRoot.querySelector('#textInput');
        if (input) {
            input.style.borderColor = '';
        }
        
        this.requestUpdate();
        
        if (this.audioCapture) {
            try {
                // Stop all tracks
                this.audioCapture.stream.getTracks().forEach(track => track.stop());
                
                // Disconnect audio nodes
                this.audioCapture.source.disconnect();
                this.audioCapture.processor.disconnect();
                
                // Close audio context
                this.audioCapture.audioContext.close();
                
                this.audioCapture = null;
                console.log('🎤 Audio capture cleaned up');
            } catch (error) {
                console.error('🎤 Error during cleanup:', error);
            }
        }

        // Close STT sessions for Ask window
        try {
            console.log('🎤 Closing STT sessions for Ask window...');
            await window.api.askView.closeSTT();
            console.log('🎤 STT sessions closed successfully');
        } catch (error) {
            console.error('🎤 Error closing STT sessions:', error);
        }
    }


}

customElements.define('ask-view', AskView);
