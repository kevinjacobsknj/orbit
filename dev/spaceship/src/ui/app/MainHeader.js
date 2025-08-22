import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';

export class MainHeader extends LitElement {
    static properties = {
        isTogglingSession: { type: Boolean, state: true },
        isTogglingAsk: { type: Boolean, state: true },
        shortcuts: { type: Object, state: true },
        listenSessionStatus: { type: String, state: true },
    };

    static styles = css`
        :host {
            display: flex;
            transition: transform 0.2s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.2s ease-out;
            position: relative;
            overflow: visible;
        }

        :host(.hiding) {
            animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.6, 1) forwards;
        }

        :host(.showing) {
            animation: slideDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        :host(.sliding-in) {
            animation: fadeIn 0.2s ease-out forwards;
        }

        :host(.hidden) {
            opacity: 0;
            transform: translateY(-150%) scale(0.85);
            pointer-events: none;
        }


        * {
            font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            cursor: default;
            user-select: none;
        }

        .header {
            -webkit-app-region: drag;
            width: max-content;
            min-width: 350px;
            height: 47px;
            padding: 2px 15px 2px 13px;
            background: transparent;
            overflow: hidden;
            border-radius: 9000px;
            /* backdrop-filter: blur(1px); */
            justify-content: space-between;
            align-items: center;
            display: inline-flex;
            box-sizing: border-box;
            position: relative;
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            border-radius: 9000px;
            z-index: -1;
        }

        .header::after {
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

        .listen-button {
            -webkit-app-region: no-drag;
            height: 26px;
            padding: 0 13px;
            background: transparent;
            border-radius: 9000px;
            justify-content: center;
            width: 78px;
            align-items: center;
            gap: 6px;
            display: flex;
            border: none;
            cursor: pointer;
            position: relative;
        }

        .listen-button:disabled {
            cursor: default;
            opacity: 0.8;
        }

        .listen-button.active::before {
            background: rgba(215, 0, 0, 0.5);
        }

        .listen-button.active:hover::before {
            background: rgba(255, 20, 20, 0.6);
        }

        .listen-button.done {
            background-color: rgba(255, 255, 255, 0.6);
            transition: background-color 0.15s ease;
        }

        .listen-button.done .action-text-content {
            color: black;
        }
        
        .listen-button.done .listen-icon svg rect,
        .listen-button.done .listen-icon svg path {
            fill: black;
        }

        .listen-button.done:hover {
            background-color: #f0f0f0;
        }

        .listen-button:hover::before {
            background: rgba(0, 0, 0, 0.7);
        }

        .listen-button::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            border-radius: 9000px;
            z-index: -1;
            transition: background 0.15s ease;
        }

        .listen-button::after {
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

        .listen-button.done::after {
            display: none;
        }

        /* Loading orbit for Listen button */
        .listen-loading-orbit {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 100%;
            height: 100%;
            transform: translate(-50%, -50%);
            pointer-events: none;
        }

        .listen-orbit-dot {
            position: absolute;
            width: 3px;
            height: 3px;
            background: white;
            border-radius: 50%;
            top: 50%;
            left: 50%;
            margin-top: -1.5px;
            margin-left: -1.5px;
            opacity: 0.9;
            animation: listen-orbit 1.5s linear infinite;
            box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
        }

        .listen-orbit-dot:nth-child(2) {
            animation-delay: 0.5s;
            opacity: 0.6;
        }

        .listen-orbit-dot:nth-child(3) {
            animation-delay: 1s;
            opacity: 0.3;
        }

        @keyframes listen-orbit {
            0% {
                transform: rotate(0deg) translateX(35px) translateY(0) scaleY(0.4) rotate(0deg);
            }
            100% {
                transform: rotate(360deg) translateX(35px) translateY(0) scaleY(0.4) rotate(-360deg);
            }
        }

        /* Loading orbit for Ask button */
        .ask-loading-orbit {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 100%;
            height: 100%;
            transform: translate(-50%, -50%);
            pointer-events: none;
        }

        .ask-orbit-dot {
            position: absolute;
            width: 3px;
            height: 3px;
            background: white;
            border-radius: 50%;
            top: 50%;
            left: 50%;
            margin-top: -1.5px;
            margin-left: -1.5px;
            opacity: 0.9;
            animation: ask-orbit 1.5s linear infinite;
            box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
        }

        .ask-orbit-dot:nth-child(2) {
            animation-delay: 0.5s;
            opacity: 0.6;
        }

        .ask-orbit-dot:nth-child(3) {
            animation-delay: 1s;
            opacity: 0.3;
        }

        @keyframes ask-orbit {
            0% {
                transform: rotate(0deg) translateX(25px) translateY(0) scaleY(0.7) rotate(0deg);
            }
            100% {
                transform: rotate(360deg) translateX(25px) translateY(0) scaleY(0.7) rotate(-360deg);
            }
        }

        /* Combined actions pill container */
        .actions-pill {
            -webkit-app-region: no-drag;
            height: 26px;
            display: flex;
            align-items: center;
            border-radius: 9000px;
            position: relative;
            background: #121212;
            padding: 0;
            overflow: hidden;
        }

        .actions-pill::after {
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

        .action-item {
            height: 26px;
            padding: 0 13px;
            display: flex;
            align-items: center;
            gap: 9px;
            cursor: pointer;
            position: relative;
            transition: background 0.15s ease;
            border-radius: 9000px;
        }

        .action-item.listen-action {
            gap: 6px;
            min-width: 78px;
            justify-content: center;
        }

        .action-item:hover {
            background: rgba(255, 255, 255, 0.15);
        }

        .action-item.active {
            background: rgba(255, 255, 255, 0.9);
        }

        .action-item.active .action-text-content {
            color: black;
        }

        .action-item.listen-action.active {
            background: rgba(255, 255, 255, 0.9);
        }

        .action-item.listen-action.active:hover {
            background: rgba(255, 255, 255, 1);
        }

        .action-item.listen-action.active .action-text-content,
        .action-item.listen-action.active .listen-icon svg rect,
        .action-item.listen-action.active .listen-icon svg path {
            fill: black;
            color: black;
        }

        .action-item.listen-action.done {
            background: rgba(255, 255, 255, 0.9);
        }

        .action-item.listen-action.done:hover {
            background: rgba(255, 255, 255, 1);
        }

        .action-item.listen-action.done .action-text-content,
        .action-item.listen-action.done .listen-icon svg rect,
        .action-item.listen-action.done .listen-icon svg path {
            fill: black;
            color: black;
        }

        .action-button,
        .action-text {
            padding-bottom: 1px;
            justify-content: center;
            align-items: center;
            gap: 10px;
            display: flex;
        }

        .action-text-content {
            color: white;
            font-size: 12px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 500; /* Medium */
            word-wrap: break-word;
        }

        .icon-container {
            justify-content: flex-start;
            align-items: center;
            gap: 4px;
            display: flex;
        }

        .icon-container.ask-icons svg,
        .icon-container.showhide-icons svg {
            width: 12px;
            height: 12px;
        }

        .listen-icon svg {
            width: 12px;
            height: 11px;
            position: relative;
            top: 0px;
        }

        .icon-box {
            color: rgba(255, 255, 255, 0.7);
            font-size: 11px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 400;
            background: none;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: auto;
            height: auto;
            padding: 0;
            margin: 0 1px;
        }

        .settings-button {
            -webkit-app-region: no-drag;
            padding: 0;
            border-radius: 9000px;
            background: #000;
            transition: background 0.15s ease;
            color: white;
            border: 0.5px solid rgba(255, 255, 255, 0.08);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            position: relative;
            width: 40px;
            height: 25px;
            justify-content: center;
            overflow: visible;
            box-shadow: 
                0 0 0 0.5px rgba(255, 255, 255, 0.04),
                inset 0 0.5px 0 rgba(255, 255, 255, 0.06),
                0 1px 2px rgba(0, 0, 0, 0.2);
        }

        .settings-button:hover {
            background: rgba(0, 0, 0, 0.9);
            border-color: rgba(255, 255, 255, 0.12);
        }

        /* Orbiting dot */
        .orbit-dot {
            position: absolute;
            width: 3px;
            height: 3px;
            background: white;
            border-radius: 50%;
            opacity: 0.9;
            animation: orbit-ellipse 20s linear infinite;
            pointer-events: none;
            box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
        }

        @keyframes orbit-ellipse {
            0% {
                transform: rotate(0deg) translateX(20px) translateY(0) scaleY(0.625) rotate(0deg);
            }
            100% {
                transform: rotate(360deg) translateX(20px) translateY(0) scaleY(0.625) rotate(-360deg);
            }
        }

        /* Star animation container */
        .settings-stars {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border-radius: 9000px;
            overflow: hidden;
        }

        .settings-star {
            position: absolute;
            background: white;
            border-radius: 50%;
            opacity: 0.8;
        }

        .settings-star.twinkle {
            animation: settings-twinkle 3s ease-in-out infinite;
        }

        .settings-star.slow {
            animation: settings-float-slow 8s ease-in-out infinite;
        }

        .settings-star.medium {
            animation: settings-float-medium 6s ease-in-out infinite;
        }

        .settings-star.fast {
            animation: settings-float-fast 4s ease-in-out infinite;
        }

        @keyframes settings-twinkle {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
        }

        @keyframes settings-float-slow {
            0%, 100% { transform: translate(0, 0); }
            25% { transform: translate(1px, -1px); }
            50% { transform: translate(-1px, 1px); }
            75% { transform: translate(1px, 1px); }
        }

        @keyframes settings-float-medium {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(-1px, -1px); }
            66% { transform: translate(1px, -1px); }
        }

        @keyframes settings-float-fast {
            0%, 100% { transform: translate(0, 0); }
            50% { transform: translate(0.5px, -0.5px); }
        }
        /* ────────────────[ GLASS BYPASS ]─────────────── */
        :host-context(body.has-glass) .header,
        :host-context(body.has-glass) .listen-button,
        :host-context(body.has-glass) .actions-pill,
        :host-context(body.has-glass) .action-item,
        :host-context(body.has-glass) .settings-button {
            background: transparent !important;
            filter: none !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
        }

        :host-context(body.has-glass) .header::before,
        :host-context(body.has-glass) .header::after,
        :host-context(body.has-glass) .listen-button::before,
        :host-context(body.has-glass) .listen-button::after,
        :host-context(body.has-glass) .actions-pill::after,
        :host-context(body.has-glass) .action-item::before,
        :host-context(body.has-glass) .settings-button::before,
        :host-context(body.has-glass) .settings-button::after {
            display: none !important;
        }

        :host-context(body.has-glass) .action-item:hover,
        :host-context(body.has-glass) .settings-button:hover::before,
        :host-context(body.has-glass) .listen-button:hover::before {
            background: transparent !important;
        }
        :host-context(body.has-glass) * {
            animation: none !important;
            transition: none !important;
            transform: none !important;
            filter: none !important;
            backdrop-filter: none !important;
            box-shadow: none !important;
        }

        :host-context(body.has-glass) .header,
        :host-context(body.has-glass) .listen-button,
        :host-context(body.has-glass) .actions-pill,
        :host-context(body.has-glass) .action-item,
        :host-context(body.has-glass) .settings-button,
        :host-context(body.has-glass) .icon-box {
            border-radius: 0 !important;
        }
        :host-context(body.has-glass) {
            animation: none !important;
            transition: none !important;
            transform: none !important;
            will-change: auto !important;
        }
        `;

    constructor() {
        super();
        this.shortcuts = {};
        this.isVisible = true;
        this.isAnimating = false;
        this.hasSlidIn = false;
        this.settingsHideTimer = null;
        this.isTogglingSession = false;
        this.isTogglingAsk = false;
        this.listenSessionStatus = 'beforeSession';
        this.animationEndTimer = null;
        this.handleAnimationEnd = this.handleAnimationEnd.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.dragState = null;
        this.wasJustDragged = false;
    }

    _getListenButtonText(status) {
        switch (status) {
            case 'beforeSession': return 'Listen';
            case 'inSession'   : return 'Stop';
            case 'afterSession': return 'Done';
            default            : return 'Listen';
        }
    }

    async handleMouseDown(e) {
        e.preventDefault();

        const initialPosition = await window.api.mainHeader.getHeaderPosition();

        this.dragState = {
            initialMouseX: e.screenX,
            initialMouseY: e.screenY,
            initialWindowX: initialPosition.x,
            initialWindowY: initialPosition.y,
            moved: false,
        };

        window.addEventListener('mousemove', this.handleMouseMove, { capture: true });
        window.addEventListener('mouseup', this.handleMouseUp, { once: true, capture: true });
    }

    handleMouseMove(e) {
        if (!this.dragState) return;

        const deltaX = Math.abs(e.screenX - this.dragState.initialMouseX);
        const deltaY = Math.abs(e.screenY - this.dragState.initialMouseY);
        
        if (deltaX > 3 || deltaY > 3) {
            this.dragState.moved = true;
        }

        const newWindowX = this.dragState.initialWindowX + (e.screenX - this.dragState.initialMouseX);
        const newWindowY = this.dragState.initialWindowY + (e.screenY - this.dragState.initialMouseY);

        window.api.mainHeader.moveHeaderTo(newWindowX, newWindowY);
    }

    handleMouseUp(e) {
        if (!this.dragState) return;

        const wasDragged = this.dragState.moved;

        window.removeEventListener('mousemove', this.handleMouseMove, { capture: true });
        this.dragState = null;

        if (wasDragged) {
            this.wasJustDragged = true;
            setTimeout(() => {
                this.wasJustDragged = false;
            }, 0);
        }
    }

    toggleVisibility() {
        if (this.isAnimating) {
            console.log('[MainHeader] Animation already in progress, ignoring toggle');
            return;
        }
        
        if (this.animationEndTimer) {
            clearTimeout(this.animationEndTimer);
            this.animationEndTimer = null;
        }
        
        this.isAnimating = true;
        
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    hide() {
        this.classList.remove('showing');
        this.classList.add('hiding');
    }
    
    show() {
        this.classList.remove('hiding', 'hidden');
        this.classList.add('showing');
    }
    
    handleAnimationEnd(e) {
        if (e.target !== this) return;
    
        this.isAnimating = false;
    
        if (this.classList.contains('hiding')) {
            this.classList.add('hidden');
            if (window.api) {
                window.api.mainHeader.sendHeaderAnimationFinished('hidden');
            }
        } else if (this.classList.contains('showing')) {
            if (window.api) {
                window.api.mainHeader.sendHeaderAnimationFinished('visible');
            }
        }
    }

    startSlideInAnimation() {
        if (this.hasSlidIn) return;
        this.classList.add('sliding-in');
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('animationend', this.handleAnimationEnd);

        if (window.api) {

            this._sessionStateTextListener = (event, { success }) => {
                if (success) {
                    this.listenSessionStatus = ({
                        beforeSession: 'inSession',
                        inSession: 'afterSession',
                        afterSession: 'beforeSession',
                    })[this.listenSessionStatus] || 'beforeSession';
                } else {
                    this.listenSessionStatus = 'beforeSession';
                }
                this.isTogglingSession = false; // ✨ 로딩 상태만 해제
            };
            window.api.mainHeader.onListenChangeSessionResult(this._sessionStateTextListener);

            this._shortcutListener = (event, keybinds) => {
                console.log('[MainHeader] Received updated shortcuts:', keybinds);
                this.shortcuts = keybinds;
            };
            window.api.mainHeader.onShortcutsUpdated(this._shortcutListener);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('animationend', this.handleAnimationEnd);
        
        if (this.animationEndTimer) {
            clearTimeout(this.animationEndTimer);
            this.animationEndTimer = null;
        }
        
        if (window.api) {
            if (this._sessionStateTextListener) {
                window.api.mainHeader.removeOnListenChangeSessionResult(this._sessionStateTextListener);
            }
            if (this._shortcutListener) {
                window.api.mainHeader.removeOnShortcutsUpdated(this._shortcutListener);
            }
        }
    }

    showSettingsWindow(element) {
        if (this.wasJustDragged) return;
        if (window.api) {
            console.log(`[MainHeader] showSettingsWindow called at ${Date.now()}`);
            window.api.mainHeader.showSettingsWindow();

        }
    }

    hideSettingsWindow() {
        if (this.wasJustDragged) return;
        if (window.api) {
            console.log(`[MainHeader] hideSettingsWindow called at ${Date.now()}`);
            window.api.mainHeader.hideSettingsWindow();
        }
    }

    async _handleListenClick() {
        if (this.wasJustDragged) return;
        if (this.isTogglingSession) {
            return;
        }

        this.isTogglingSession = true;

        try {
            const listenButtonText = this._getListenButtonText(this.listenSessionStatus);
            if (window.api) {
                await window.api.mainHeader.sendListenButtonClick(listenButtonText);
            }
        } catch (error) {
            console.error('IPC invoke for session change failed:', error);
            this.isTogglingSession = false;
        }
    }

    async _handleAskClick() {
        if (this.wasJustDragged) return;
        if (this.isTogglingAsk) return;

        this.isTogglingAsk = true;

        try {
            if (window.api) {
                await window.api.mainHeader.sendAskButtonClick();
            }
        } catch (error) {
            console.error('IPC invoke for ask button failed:', error);
        } finally {
            // Reset loading state after a brief delay to show the animation
            setTimeout(() => {
                this.isTogglingAsk = false;
            }, 1000);
        }
    }

    async _handleToggleAllWindowsVisibility() {
        if (this.wasJustDragged) return;

        try {
            if (window.api) {
                await window.api.mainHeader.sendToggleAllWindowsVisibility();
            }
        } catch (error) {
            console.error('IPC invoke for all windows visibility button failed:', error);
        }
    }


    renderShortcut(accelerator) {
        if (!accelerator) return html``;

        const keyMap = {
            'Cmd': '⌘', 'Command': '⌘',
            'Ctrl': '⌃', 'Control': '⌃',
            'Alt': '⌥', 'Option': '⌥',
            'Shift': '⇧',
            'Enter': '↵',
            'Backspace': '⌫',
            'Delete': '⌦',
            'Tab': '⇥',
            'Escape': '⎋',
            'Up': '↑', 'Down': '↓', 'Left': '←', 'Right': '→',
            '\\': html`<svg viewBox="0 0 6 12" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:6px; height:12px;"><path d="M1.5 1.3L5.1 10.6" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        };

        const keys = accelerator.split('+');
        return html`${keys.map(key => html`
            <div class="icon-box">${keyMap[key] || key}</div>
        `)}`;
    }

    renderSettingsStars() {
        const starCount = 25;
        const width = 40;
        const height = 25;
        const centerX = width / 2;
        const centerY = height / 2;
        const stars = [];
        
        for (let i = 0; i < starCount; i++) {
            // Generate random position within oval bounds
            const angle = Math.random() * Math.PI * 2;
            const radiusX = (width / 2) - 2;
            const radiusY = (height / 2) - 2;
            const distance = Math.random();
            
            // Convert to x, y coordinates (oval shape)
            const x = centerX + Math.cos(angle) * radiusX * distance;
            const y = centerY + Math.sin(angle) * radiusY * distance;
            
            // Random star properties
            const size = Math.random() * 0.5 + 0.2; // 0.2 to 0.7px
            const animationType = ['twinkle', 'slow', 'medium', 'fast'][Math.floor(Math.random() * 4)];
            const delay = Math.random() * 3; // Random animation delay
            
            stars.push(html`
                <div 
                    class="settings-star ${animationType}"
                    style="
                        left: ${x - size/2}px;
                        top: ${y - size/2}px;
                        width: ${size}px;
                        height: ${size}px;
                        animation-delay: ${delay}s;
                    "
                ></div>
            `);
        }
        
        return stars;
    }

    render() {
        const listenButtonText = this._getListenButtonText(this.listenSessionStatus);
    
        const buttonClasses = {
            active: listenButtonText === 'Stop',
            done: listenButtonText === 'Done',
        };
        const showStopIcon = listenButtonText === 'Stop' || listenButtonText === 'Done';

        return html`
            <div class="header" @mousedown=${this.handleMouseDown}>
                <!-- Settings Button (moved to left of actions) -->
                <button 
                    class="settings-button"
                    @mouseenter=${(e) => this.showSettingsWindow(e.currentTarget)}
                    @mouseleave=${() => this.hideSettingsWindow()}
                >
                    <div class="orbit-dot"></div>
                    <div class="settings-stars">
                        ${this.renderSettingsStars()}
                    </div>
                </button>
                
                <!-- Combined Actions Pill -->
                <div class="actions-pill">
                    <!-- Listen Button -->
                    <div 
                        class="action-item listen-action ${Object.keys(buttonClasses).filter(k => buttonClasses[k]).join(' ')}"
                        @click=${this._handleListenClick}
                        ?disabled=${this.isTogglingSession}
                    >
                        ${this.isTogglingSession
                            ? html`
                                <div class="listen-loading-orbit">
                                    <div class="listen-orbit-dot"></div>
                                    <div class="listen-orbit-dot"></div>
                                    <div class="listen-orbit-dot"></div>
                                </div>
                            `
                            : html`
                                <div class="action-text">
                                    <div class="action-text-content">${listenButtonText}</div>
                                </div>
                                <div class="listen-icon">
                                    ${showStopIcon
                                        ? html`
                                            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <rect width="9" height="9" rx="1" fill="white"/>
                                            </svg>
                                        `
                                        : html`
                                            <svg width="12" height="11" viewBox="0 0 12 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M1.69922 2.7515C1.69922 2.37153 2.00725 2.0635 2.38722 2.0635H2.73122C3.11119 2.0635 3.41922 2.37153 3.41922 2.7515V8.2555C3.41922 8.63547 3.11119 8.9435 2.73122 8.9435H2.38722C2.00725 8.9435 1.69922 8.63547 1.69922 8.2555V2.7515Z" fill="white"/>
                                                <path d="M5.13922 1.3755C5.13922 0.995528 5.44725 0.6875 5.82722 0.6875H6.17122C6.55119 0.6875 6.85922 0.995528 6.85922 1.3755V9.6315C6.85922 10.0115 6.55119 10.3195 6.17122 10.3195H5.82722C5.44725 10.3195 5.13922 10.0115 5.13922 9.6315V1.3755Z" fill="white"/>
                                                <path d="M8.57922 3.0955C8.57922 2.71553 8.88725 2.4075 9.26722 2.4075H9.61122C9.99119 2.4075 10.2992 2.71553 10.2992 3.0955V7.9115C10.2992 8.29147 9.99119 8.5995 9.61122 8.5995H9.26722C8.88725 8.5995 8.57922 8.29147 8.57922 7.9115V3.0955Z" fill="white"/>
                                            </svg>
                                        `}
                                </div>
                            `}
                    </div>
                    
                    <!-- Ask Button -->
                    <div class="action-item" @click=${() => this._handleAskClick()} ?disabled=${this.isTogglingAsk}>
                        ${this.isTogglingAsk
                            ? html`
                                <div class="ask-loading-orbit">
                                    <div class="ask-orbit-dot"></div>
                                    <div class="ask-orbit-dot"></div>
                                    <div class="ask-orbit-dot"></div>
                                </div>
                            `
                            : html`
                                <div class="action-text">
                                    <div class="action-text-content">Ask</div>
                                </div>
                                <div class="icon-container">
                                    ${this.renderShortcut(this.shortcuts.nextStep)}
                                </div>
                            `}
                    </div>
                    
                    <!-- Hide Button -->
                    <div class="action-item" @click=${() => this._handleToggleAllWindowsVisibility()}>
                        <div class="action-text">
                            <div class="action-text-content">Hide</div>
                        </div>
                        <div class="icon-container">
                            ${this.renderShortcut(this.shortcuts.toggleVisibility)}
                        </div>
                    </div>
                </div>
            </div>
            
        `;
    }
}

customElements.define('main-header', MainHeader);
