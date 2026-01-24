const Cursor = {
    dot: null,
    outline: null,
    mouseX: 0,
    mouseY: 0,
    outlineX: 0,
    outlineY: 0,

    init() {
        this.dot = document.querySelector('.cursor-dot');
        this.outline = document.querySelector('.cursor-outline');

        if (!this.dot || !this.outline) return;

        this.setupEventListeners();
        this.animateOutline();
    },

    setupEventListeners() {
        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
            this.dot.style.transform = `translate3d(${this.mouseX}px, ${this.mouseY}px, 0) translate(-50%, -50%)`;
        });

        window.addEventListener('mousedown', () => {
            this.dot.classList.add('cursor-active');
            this.outline.classList.add('cursor-active');
        });

        window.addEventListener('mouseup', () => {
            this.dot.classList.remove('cursor-active');
            this.outline.classList.remove('cursor-active');
        });

        // Global hover delegation
        document.addEventListener('mouseover', (e) => {
            const el = e.target.closest('a, button, input, textarea, [role="button"], .card, .landing-card, tr, .topic-btn');
            if (el) {
                this.dot.classList.add('cursor-hover');
                this.outline.classList.add('cursor-hover');
            }
        });

        document.addEventListener('mouseout', (e) => {
            const el = e.target.closest('a, button, input, textarea, [role="button"], .card, .landing-card, tr, .topic-btn');
            if (el) {
                this.dot.classList.remove('cursor-hover');
                this.outline.classList.remove('cursor-hover');
            }
        });
    },

    animateOutline() {
        const distX = this.mouseX - this.outlineX;
        const distY = this.mouseY - this.outlineY;

        this.outlineX += distX * 0.25;
        this.outlineY += distY * 0.25;

        this.outline.style.transform = `translate3d(${this.outlineX}px, ${this.outlineY}px, 0) translate(-50%, -50%)`;

        requestAnimationFrame(() => this.animateOutline());
    }
};

// Initialize after DOM load
document.addEventListener('DOMContentLoaded', () => Cursor.init());
