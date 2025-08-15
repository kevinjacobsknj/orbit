import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';

export class StarCircle extends LitElement {
    static properties = {
        size: { type: Number },
    };

    static styles = css`
        :host {
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }

        .star-circle {
            position: relative;
            border-radius: 50%;
            background: #000;
            overflow: hidden;
            border: 0.5px solid rgba(255, 255, 255, 0.08);
            box-shadow: 
                0 0 0 0.5px rgba(255, 255, 255, 0.04),
                inset 0 0.5px 0 rgba(255, 255, 255, 0.06),
                0 1px 2px rgba(0, 0, 0, 0.2);
        }

        .stars-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            overflow: hidden;
        }

        .star {
            position: absolute;
            background: white;
            border-radius: 50%;
            opacity: 0.8;
        }

        .star.twinkle {
            animation: twinkle 3s ease-in-out infinite;
        }

        .star.slow {
            animation: float-slow 8s ease-in-out infinite;
        }

        .star.medium {
            animation: float-medium 6s ease-in-out infinite;
        }

        .star.fast {
            animation: float-fast 4s ease-in-out infinite;
        }

        @keyframes twinkle {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
        }

        @keyframes float-slow {
            0%, 100% { transform: translate(0, 0); }
            25% { transform: translate(1px, -1px); }
            50% { transform: translate(-1px, 1px); }
            75% { transform: translate(1px, 1px); }
        }

        @keyframes float-medium {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(-1px, -1px); }
            66% { transform: translate(1px, -1px); }
        }

        @keyframes float-fast {
            0%, 100% { transform: translate(0, 0); }
            50% { transform: translate(0.5px, -0.5px); }
        }
    `;

    constructor() {
        super();
        this.size = 25;
        this.stars = [];
        this.generateStars();
    }

    generateStars() {
        const starCount = 25;
        const radius = (this.size / 2) - 2;
        const center = this.size / 2;
        
        this.stars = [];
        
        for (let i = 0; i < starCount; i++) {
            // Generate random angle and distance from center
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * radius;
            
            // Convert to x, y coordinates
            const x = center + Math.cos(angle) * distance;
            const y = center + Math.sin(angle) * distance;
            
            // Random star properties
            const size = Math.random() * 0.5 + 0.2; // 0.2 to 0.7px
            const animationType = ['twinkle', 'slow', 'medium', 'fast'][Math.floor(Math.random() * 4)];
            const delay = Math.random() * 3; // Random animation delay
            
            this.stars.push({
                x: x - size/2,
                y: y - size/2,
                size,
                animationType,
                delay
            });
        }
    }

    render() {
        return html`
            <div 
                class="star-circle" 
                style="width: ${this.size}px; height: ${this.size}px;"
            >
                <div class="stars-container">
                    ${this.stars.map(star => html`
                        <div 
                            class="star ${star.animationType}"
                            style="
                                left: ${star.x}px;
                                top: ${star.y}px;
                                width: ${star.size}px;
                                height: ${star.size}px;
                                animation-delay: ${star.delay}s;
                            "
                        ></div>
                    `)}
                </div>
            </div>
        `;
    }
}

customElements.define('star-circle', StarCircle);