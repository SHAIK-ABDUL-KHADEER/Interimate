const App = {
    currentState: 'landing', // landing, login, register, dashboard, selection, quiz, leaderboard
    currentCategory: null,
    currentSection: null, // mcq, practice
    userProgress: {},
    isLoading: false,
    isListening: false,
    recognition: null,

    init() {
        // Load Razorpay Script
        if (!document.getElementById('razorpay-sdk')) {
            const script = document.createElement('script');
            script.id = 'razorpay-sdk';
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            document.head.appendChild(script);
        }

        this.initCursor();
        window.addEventListener('popstate', (e) => this.handlePopState(e));
        window.addEventListener('hashchange', () => this.handleHashChange());

        // Initial route check
        if (Auth.isAuthenticated()) {
            if (window.location.hash) {
                this.handleHashChange();
            } else {
                this.setState('dashboard', {}, false);
            }
        } else {
            if (window.location.hash) {
                this.handleHashChange();
            } else {
                this.render();
                history.replaceState({ state: this.currentState, params: {} }, '');
            }
        }

        this.attachGlobalListeners();
    },

    handleHashChange() {
        const hash = window.location.hash.substring(1);
        const validStaticPages = ['contact', 'terms', 'refunds', 'privacy'];
        if (validStaticPages.includes(hash)) {
            this.setState('static', { page: hash }, false);
        } else if (hash === 'dashboard' && Auth.isAuthenticated()) {
            this.setState('dashboard', {}, false);
        }
    },

    setLoading(loading) {
        this.isLoading = loading;
        const outline = document.querySelector('.cursor-outline');
        if (outline) {
            if (loading) outline.classList.add('loading');
            else outline.classList.remove('loading');
        }
    },

    notify(message, type = 'info') {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `sigma-notify ${type}`;

        notification.innerHTML = `
            <span>${message}</span>
            <div class="notify-close" style="cursor:pointer; opacity:0.5;">&times;</div>
        `;

        container.appendChild(notification);

        // Auto remove
        const timer = setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 400);
        }, 4000);

        notification.querySelector('.notify-close').onclick = () => {
            clearTimeout(timer);
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 400);
        };
    },

    showBadgeUnlockNotification(newBadges) {
        if (!newBadges || newBadges.length === 0) return;

        const container = document.getElementById('notification-container');
        if (!container) return;

        newBadges.forEach(badge => {
            const notification = document.createElement('div');
            notification.className = `sigma-notify success pulse-glow`;
            notification.style.borderLeft = `4px solid ${badge.color || 'var(--accent)'}`;

            notification.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <div style="font-weight: 900; letter-spacing: 0.1em; color: #fff;">[ MISSION_ACCOMPLISHED ]</div>
                    <div style="font-size: 0.75rem; color: var(--accent);">${badge.title} UNLOCKED</div>
                    <button class="btn-primary" style="font-size: 0.6rem; padding: 0.4rem 1rem; width: auto; margin-top: 0.5rem;" onclick="App.setState('badges')">VIEW IN MISSIONS</button>
                </div>
                <div class="notify-close" style="cursor:pointer; opacity:0.5; align-self: flex-start;">&times;</div>
            `;

            container.appendChild(notification);

            // Auto remove after longer time (7s)
            const timer = setTimeout(() => {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 400);
            }, 7000);

            notification.querySelector('.notify-close').onclick = () => {
                clearTimeout(timer);
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 400);
            };
        });
    },

    initCursor() {
        const dot = document.querySelector('.cursor-dot');
        const outline = document.querySelector('.cursor-outline');

        if (!dot || !outline) return;

        let mouseX = 0;
        let mouseY = 0;
        let outlineX = 0;
        let outlineY = 0;

        window.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;

            // Use translate3d for better performance + keep centering
            dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
        });

        // Smoother trailing effect
        const animateOutline = () => {
            const distX = mouseX - outlineX;
            const distY = mouseY - outlineY;

            // Faster interpolation for less lag
            outlineX += distX * 0.25;
            outlineY += distY * 0.25;

            outline.style.transform = `translate3d(${outlineX}px, ${outlineY}px, 0) translate(-50%, -50%)`;

            requestAnimationFrame(animateOutline);
        };
        animateOutline();

        // Hover effect for interactive elements
        document.addEventListener('mouseover', (e) => {
            if (e.target.closest('button, a, .card, .landing-card, .logo, input, textarea, [role="button"]')) {
                dot.classList.add('cursor-hover');
                outline.classList.add('cursor-hover');
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.closest('button, a, .card, .landing-card, .logo, input, textarea, [role="button"]')) {
                dot.classList.remove('cursor-hover');
                outline.classList.remove('cursor-hover');
            }
        });

        document.addEventListener('mousedown', () => {
            dot.classList.add('cursor-active');
            outline.classList.add('cursor-active');
        });

        document.addEventListener('mouseup', () => {
            dot.classList.remove('cursor-active');
            outline.classList.remove('cursor-active');
        });
    },

    attachGlobalListeners() {
        // Logo redirection
        const logo = document.querySelector('.logo');
        if (logo) {
            logo.style.cursor = 'pointer';
            logo.addEventListener('click', () => {
                if (Auth.isAuthenticated()) this.setState('dashboard');
                else this.setState('landing');
            });
        }

        document.getElementById('nav-dashboard').addEventListener('click', () => this.setState('dashboard'));
        document.getElementById('nav-interviews').addEventListener('click', () => this.setState('interviews'));
        document.getElementById('nav-pricing').addEventListener('click', () => this.setState('pricing'));
        document.getElementById('nav-feedback').addEventListener('click', () => this.setState('feedback'));
        document.getElementById('nav-leaderboard').addEventListener('click', () => this.setState('leaderboard'));
        document.getElementById('nav-badges').addEventListener('click', () => this.setState('badges'));
        document.getElementById('nav-logout').addEventListener('click', () => this.showLogoutModal());

        // Mobile Menu Toggle
        const menuToggle = document.getElementById('mobile-menu-toggle');
        const navLinks = document.querySelector('.nav-links');
        if (menuToggle && navLinks) {
            menuToggle.addEventListener('click', () => {
                navLinks.classList.toggle('active');
            });
        }
    },

    showLogoutModal() {
        const modal = document.createElement('div');
        modal.id = 'logout-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h3 style="color: var(--accent); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.1em;">Confirm Logout</h3>
                <p style="color: var(--text-secondary); margin-bottom: 2rem; font-size: 0.9rem;">Are you sure you want to terminate the current session?</p>
                <div style="display: flex; gap: 1rem; justify-content: center;">
                    <button class="btn-primary" id="confirm-logout" style="width: auto; padding: 0.8rem 2rem;">LOGOUT</button>
                    <button class="btn-secondary" id="cancel-logout" style="width: auto; padding: 0.8rem 2rem;">CANCEL</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('confirm-logout').onclick = () => Auth.logout();
        document.getElementById('cancel-logout').onclick = () => modal.remove();

        // Close on overlay click
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    },

    async setState(state, params = {}, pushHistory = true) {
        if (this.isListening) this.stopMic();

        // Sync URL Hash
        if (state === 'static' && params.page) {
            if (window.location.hash !== `#${params.page}`) {
                window.location.hash = params.page;
            }
        } else if (window.location.hash) {
            // Strip hash for functional pages to avoid URL/State traps
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }

        // Close mobile menu on state change
        const navLinks = document.querySelector('.nav-links');
        if (navLinks) navLinks.classList.remove('active');

        this.currentState = state;
        this.currentParams = params;
        this.setLoading(true);
        if (state === 'dashboard' || state === 'leaderboard' || state === 'selection' || state === 'quiz' || state === 'interviews') {
            await this.loadProgress();
        }
        this.setLoading(false);
        if (state === 'selection' || state === 'quiz') {
            this.currentCategory = params.category || this.currentCategory;
            this.currentSection = params.section || null;
        }

        if (pushHistory) {
            history.pushState({ state, params }, '');
        }

        // --- GOOGLE ANALYTICS: Track Virtual Page View ---
        if (window.gtag) {
            gtag('event', 'page_view', {
                page_title: state.charAt(0).toUpperCase() + state.slice(1),
                page_location: window.location.href,
                page_path: `/${state}`
            });
        }

        this.render();
    },

    handlePopState(event) {
        if (event.state) {
            const { state, params } = event.state;
            this.setState(state, params, false);
        }
    },

    async loadProgress() {
        if (!Auth.isAuthenticated()) return;
        try {
            const response = await fetch('/api/progress', {
                headers: Auth.getAuthHeader()
            });
            this.userProgress = await response.json();
            this.updateGlobalCredits();
        } catch (error) {
            console.error('Failed to load progress:', error);
        }
    },

    updateGlobalCredits() {
        const globalEl = document.getElementById('global-credits');
        const countEl = document.getElementById('global-credits-count');
        const badgeEl = document.getElementById('global-badges');
        const badgeCountEl = document.getElementById('global-badges-count');

        if (Auth.isAuthenticated()) {
            if (globalEl && countEl) {
                globalEl.classList.remove('hidden');
                countEl.textContent = this.userProgress.interviewCredits || 0;
            }
            if (badgeEl && badgeCountEl) {
                badgeEl.classList.remove('hidden');
                badgeCountEl.textContent = (this.userProgress.badges || []).length;
            }
        } else {
            if (globalEl) globalEl.classList.add('hidden');
            if (badgeEl) badgeEl.classList.add('hidden');
        }
    },

    render() {
        const content = document.getElementById('content');
        const header = document.getElementById('main-header');
        const navBtns = document.querySelectorAll('.nav-btn');

        navBtns.forEach(btn => btn.classList.remove('active'));

        if (!Auth.isAuthenticated()) {
            header.classList.add('hidden');
            if (this.currentState === 'register') {
                this.renderRegister(content);
            } else if (this.currentState === 'login') {
                this.renderLogin(content);
            } else {
                this.renderLanding(content);
            }
            return;
        }

        header.classList.remove('hidden');
        if (Object.keys(this.userProgress).length === 0) {
            this.loadProgress(); // Fire and forget sync if empty
        }
        this.updateGlobalCredits();

        switch (this.currentState) {
            case 'dashboard':
                if (document.getElementById('nav-dashboard')) document.getElementById('nav-dashboard').classList.add('active');
                this.renderDashboard(content);
                break;
            case 'interviews':
                if (document.getElementById('nav-interviews')) document.getElementById('nav-interviews').classList.add('active');
                this.renderInterviews(content);
                break;
            case 'pricing':
                if (document.getElementById('nav-pricing')) document.getElementById('nav-pricing').classList.add('active');
                this.renderPricing(content);
                break;
            case 'feedback':
                if (document.getElementById('nav-feedback')) document.getElementById('nav-feedback').classList.add('active');
                this.renderFeedback(content);
                break;
            case 'leaderboard':
                if (document.getElementById('nav-leaderboard')) document.getElementById('nav-leaderboard').classList.add('active');
                this.renderLeaderboard(content);
                break;
            case 'badges':
                if (document.getElementById('nav-badges')) document.getElementById('nav-badges').classList.add('active');
                this.renderBadges(content);
                break;
            case 'selection':
                this.renderSelection(content);
                break;
            case 'static':
                this.renderStaticPage(content, this.currentParams.page);
                break;
            case 'quiz':
                Quiz.init(this.currentCategory, this.currentSection, content);
                break;
            default:
                this.renderDashboard(content);
        }
    },

    renderLanding(container) {
        container.innerHTML = `
            <div class="hero">
                <div class="hero-subtitle">Artificial Intelligence • Career Guidance</div>
                <h1 class="hero-title">Evolve Your<br>Expertise</h1>
                <p style="color: var(--text-secondary); max-width: 600px; margin-bottom: 3rem; font-size: 1.1rem;">
                    The next-generation QEA preparation platform. Deep-dive into Java, Selenium, and SQL with AI-driven surgical feedback.
                </p>
                <div class="cta-group">
                    <button class="btn-primary" style="width: auto; padding: 1.2rem 3rem;" onclick="App.setState('register')">REGISTER NOW</button>
                    <button class="btn-secondary" style="width: auto; padding: 1.2rem 3rem;" onclick="App.setState('login')">USER LOGIN</button>
                </div>

                <div class="landing-grid">
                    <div class="landing-card" onclick="App.setState('login')">
                        <h3 style="color: var(--accent);">JAVA CORE</h3>
                        <p>Master absolute logic, arrays, and syntax fundamentals.</p>
                    </div>
                    <div class="landing-card" onclick="App.setState('login')">
                        <h3 style="color: var(--accent);">SELENIUM</h3>
                        <p>Locate complex elements and automate professional workflows in Java.</p>
                    </div>
                    <div class="landing-card" onclick="App.setState('login')">
                        <h3 style="color: var(--accent);">SQL DB</h3>
                        <p>From bedrock DDL to complex relational synthesis.</p>
                    </div>
                </div>

                <!-- Landing Page Pricing -->
                <div class="pricing-container" style="margin-top: 8rem; border-top: 1px solid var(--border); padding-top: 6rem;">
                    <div style="text-align: center; margin-bottom: 4rem;">
                        <h2 style="font-size: 2.5rem; font-weight: 900; text-transform: uppercase;">Plans & Pricing</h2>
                        <p style="color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.8rem;">Select your expertise elevation protocol</p>
                    </div>
                    <div class="pricing-grid">
                        <div class="pricing-card">
                            <div class="plan-name">FREE</div>
                            <div class="plan-price">₹0<span>/mo</span></div>
                            <ul class="plan-features">
                                <li>UNLIMITED QUIZ QUESTIONS</li>
                                <li>UNLIMITED CODE CHALLENGES</li>
                                <li>1 FREE TOPIC INTERVIEW</li>
                            </ul>
                            <button class="btn-secondary" style="margin-top: auto;" onclick="App.setState('register')">START FOR FREE</button>
                        </div>
                        <div class="pricing-card premium">
                            <div class="premium-badge">RECOMMENDED</div>
                            <div class="plan-name">ADVANCED</div>
                            <div class="plan-price">₹99<span>/life</span></div>
                            <ul class="plan-features">
                                <li>UNLIMITED EVERYTHING</li>
                                <li>RESUME-BASED AI INTERVIEWS</li>
                                <li>3 FULL INTERVIEW SESSIONS</li>
                            </ul>
                            <button class="btn-primary" style="margin-top: auto;" onclick="App.setState('register')">GET FULL ACCESS</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderLogin(container) {
        container.innerHTML = `
            <div class="auth-container">
                <h2>User Login</h2>
                <div class="form-group">
                    <label>Email Address</label>
                    <input type="email" id="login-email" placeholder="user@interimate.io">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <div style="position: relative;">
                        <input type="password" id="login-password" placeholder="••••••••">
                        <span class="password-toggle" onclick="App.togglePassword('login-password')">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </span>
                    </div>
                    <div style="text-align: right; margin-top: 5px;">
                        <a href="#" id="toggle-forgot" style="font-size: 0.65rem; color: var(--accent); text-decoration: none; text-transform: uppercase; letter-spacing: 0.05em;">Forgot Password?</a>
                    </div>
                </div>
                <button id="login-btn" class="btn-primary">Login Now</button>
                <p style="text-align: center; margin-top: 1.5rem; font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
                    New user? <a href="#" id="toggle-register" style="color: var(--accent); text-decoration: none;">Create Account</a>
                </p>
                <button class="btn-secondary" style="margin-top: 1rem; width: 100%;" onclick="App.setState('landing')">Return to Home</button>
            </div>
        `;

        document.getElementById('login-btn').addEventListener('click', async () => {
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            this.setLoading(true);
            const success = await Auth.login(email, password);
            this.setLoading(false);
            if (success) this.setState('dashboard');
        });

        document.getElementById('toggle-register').addEventListener('click', (e) => {
            e.preventDefault();
            this.renderRegister(container);
        });

        document.getElementById('toggle-forgot').addEventListener('click', (e) => {
            e.preventDefault();
            this.renderForgotPassword(container);
        });
    },

    renderForgotPassword(container) {
        container.innerHTML = `
            <div class="auth-container">
                <h2>Reset Password</h2>
                <p style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 1.5rem; text-align: center;">ENTER YOUR REGISTERED EMAIL TO RECEIVE A RECOVERY CODE.</p>
                <div class="form-group">
                    <label>Email Address</label>
                    <input type="email" id="forgot-email" placeholder="agent@interimate.io">
                </div>
                <button id="forgot-btn" class="btn-primary">Send Recovery Code</button>
                <p style="text-align: center; margin-top: 1.5rem; font-size: 0.75rem;">
                    <a href="#" id="back-to-login" style="color: var(--accent); text-decoration: none;">Return to Login</a>
                </p>
            </div>
        `;

        document.getElementById('forgot-btn').addEventListener('click', async () => {
            const email = document.getElementById('forgot-email').value;
            if (!email) return App.notify('Email required', 'error');

            const btn = document.getElementById('forgot-btn');
            btn.disabled = true;
            btn.textContent = 'Verifying...';

            const success = await Auth.forgotPasswordOTP(email);
            if (success) {
                this.renderResetPassword(container, email);
            } else {
                btn.disabled = false;
                btn.textContent = 'Send Recovery Code';
            }
        });

        document.getElementById('back-to-login').addEventListener('click', (e) => {
            e.preventDefault();
            this.renderLogin(container);
        });
    },

    renderResetPassword(container, email) {
        container.innerHTML = `
            <div class="auth-container">
                <h2>Set New Password</h2>
                <p style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 1.5rem; text-align: center;">RECOVERY CODE SENT TO: ${email}</p>
                <div class="form-group">
                    <label>OTP Code</label>
                    <input type="text" id="reset-otp" placeholder="XXXXXX">
                </div>
                <div class="form-group">
                    <label>New Password</label>
                    <div style="position: relative;">
                        <input type="password" id="reset-password" placeholder="••••••••">
                        <span class="password-toggle" onclick="App.togglePassword('reset-password')">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </span>
                    </div>
                </div>
                <button id="reset-btn" class="btn-primary">Update Password</button>
                <p style="text-align: center; margin-top: 1.5rem; font-size: 0.75rem;">
                    <a href="#" id="cancel-reset" style="color: var(--accent); text-decoration: none;">Cancel</a>
                </p>
            </div>
        `;

        document.getElementById('reset-btn').addEventListener('click', async () => {
            const otp = document.getElementById('reset-otp').value;
            const newPassword = document.getElementById('reset-password').value;

            if (!otp || !newPassword) return App.notify('All fields required', 'error');

            const btn = document.getElementById('reset-btn');
            btn.disabled = true;
            btn.textContent = 'Updating...';

            const success = await Auth.resetPassword(email, otp, newPassword);
            this.setLoading(false);
            if (success) {
                this.renderLogin(container);
            } else {
                btn.disabled = false;
                btn.textContent = 'Update Password';
            }
        });

        document.getElementById('cancel-reset').addEventListener('click', (e) => {
            e.preventDefault();
            this.renderLogin(container);
        });
    },

    renderRegister(container) {
        container.innerHTML = `
            <div class="auth-container">
                <h2>Register Account</h2>
                <div class="form-group">
                    <label>Username (Unique ID)</label>
                    <input type="text" id="reg-username" placeholder="Agent_Sigma">
                </div>
                <div class="form-group">
                    <label>Email Address</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="email" id="reg-email" placeholder="agent@interimate.io">
                        <button id="send-otp-btn" class="btn-primary" style="width: auto; padding: 0 1rem; font-size: 0.7rem;">Send OTP</button>
                    </div>
                </div>
                <div class="form-group">
                    <label>OTP Code</label>
                    <input type="text" id="reg-otp" placeholder="XXXXXX">
                </div>
                <div class="form-group">
                    <label>Choose Password</label>
                    <div style="position: relative;">
                        <input type="password" id="reg-password" placeholder="••••••••">
                        <span class="password-toggle" onclick="App.togglePassword('reg-password')">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </span>
                    </div>
                </div>
                <button id="register-btn" class="btn-primary">Verify & Create Account</button>
                <p style="text-align: center; margin-top: 1.5rem; font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
                    Already active? <a href="#" id="toggle-login" style="color: var(--accent); text-decoration: none;">Login</a>
                </p>
                <button class="btn-secondary" style="margin-top: 1rem; width: 100%;" onclick="App.setState('landing')">Return to Landing</button>
            </div>
        `;

        document.getElementById('send-otp-btn').addEventListener('click', async () => {
            const username = document.getElementById('reg-username').value;
            const email = document.getElementById('reg-email').value;
            if (!username) return App.notify('Enter username first', 'error');
            if (!email) return App.notify('Enter email first', 'error');

            const btn = document.getElementById('send-otp-btn');
            btn.disabled = true;
            btn.textContent = 'Sending...';

            try {
                const res = await fetch('/api/send-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, username })
                });
                const data = await res.json();
                App.notify(data.message, res.ok ? 'success' : 'error');
                btn.textContent = 'Resend';
            } catch (err) {
                App.notify('Failed to send OTP', 'error');
                btn.textContent = 'Retry';
            }
            btn.disabled = false;
        });

        document.getElementById('register-btn').addEventListener('click', async () => {
            const username = document.getElementById('reg-username').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            const otp = document.getElementById('reg-otp').value;

            this.setLoading(true);
            const success = await Auth.register(username, email, password, otp);
            this.setLoading(false);
            if (success) this.setState('login');
        });

        document.getElementById('toggle-login').addEventListener('click', (e) => {
            e.preventDefault();
            this.renderLogin(container);
        });
    },

    togglePassword(id) {
        const input = document.getElementById(id);
        if (input.type === 'password') {
            input.type = 'text';
        } else {
            input.type = 'password';
        }
    },

    renderDashboard(container) {
        const categories = [
            {
                id: 'java', name: 'Java Development', icon: `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m5 15 7-7 7 7"/></svg>
            ` },
            {
                id: 'selenium', name: 'Selenium Automation', icon: `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            ` },
            {
                id: 'sql', name: 'SQL & Databases', icon: `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
            ` }
        ];

        container.innerHTML = `
            <div class="dashboard-header" style="margin-bottom: 4rem;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                    <h1 style="font-size: 3.5rem; letter-spacing: -0.05em; font-weight: 900; color: var(--accent); text-transform: uppercase;">User Dashboard</h1>
                    <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--accent); opacity: 0.6; margin-bottom: 1rem;">INTERIMATE // v3.0 [PROD]</div>
                </div>
                <p style="color: var(--text-secondary); max-width: 600px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.2em; margin-top: 1rem;">User: ${Auth.empId} // Status: ${this.userProgress.plan === 'paid' ? 'PREMIUM ACCESS' : 'FREE TIER'} // CREDITS: ${this.userProgress.interviewCredits || 0}</p>
            </div>
            <div class="dashboard-grid">
                ${categories.map(cat => {
            const prog = this.userProgress[cat.id] || { mcq: {}, practice: {} };
            const mcqCount = Object.keys(prog.mcq || {}).length;
            const practiceCount = Object.keys(prog.practice || {}).length;
            const totalProgress = Math.round(((mcqCount + practiceCount) / 150) * 100);

            return `
                    <div class="card" onclick="App.setState('selection', { category: '${cat.id}' })">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div class="card-icon" style="color: var(--accent);">${cat.icon}</div>
                            <div style="font-family: var(--font-mono); font-size: 0.6rem; color: var(--accent); padding: 0.2rem 0.5rem; border: 1px solid var(--accent); border-radius: 2px;">NEON-TRACK</div>
                        </div>
                        <h3 style="font-size: 1.5rem; font-weight: 800; text-transform: uppercase; letter-spacing: -0.02em; margin-top: 1.5rem;">${cat.name}</h3>
                        <div style="font-size: 0.7rem; color: var(--text-secondary); margin: 0.5rem 0 2rem 0; font-family: var(--font-mono); letter-spacing: 0.1em;">
                            AI SYNTHESIS: <span style="color: #fff;">${mcqCount}/100</span> MCQ · <span style="color: #fff;">${practiceCount}/50</span> CODE
                        </div>
                        <div class="progress-container">
                            <div class="progress-bar-bg">
                                <div class="progress-fill" style="width: ${totalProgress}%;"></div>
                            </div>
                            <div class="progress-text">
                                <span>Mastery Level</span>
                                <span>${totalProgress}%</span>
                            </div>
                        </div>
                    </div>
                    `;
        }).join('')}
                
                <!-- Future Modules -->
                <div class="card coming-soon">
                    <div class="card-icon" style="color: #333;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    </div>
                    <h3 style="font-size: 1.3rem; font-weight: 800; text-transform: uppercase; margin-top: 1.5rem; color: #888;">Functional Testing</h3>
                    <p style="color: #666; font-size: 0.7rem; margin-top: 0.5rem; font-family: var(--font-mono);">IN_CALIBRATION</p>
                </div>

                <div class="card coming-soon">
                    <div class="card-icon" style="color: #333;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/></svg>
                    </div>
                    <h3 style="font-size: 1.3rem; font-weight: 800; text-transform: uppercase; margin-top: 1.5rem; color: #888;">TestNG Framework</h3>
                    <p style="color: #666; font-size: 0.7rem; margin-top: 0.5rem; font-family: var(--font-mono);">PROTOCOL_PENDING</p>
                </div>

                <div class="card coming-soon">
                    <div class="card-icon" style="color: #333;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M10 9H8"/></svg>
                    </div>
                    <h3 style="font-size: 1.3rem; font-weight: 800; text-transform: uppercase; margin-top: 1.5rem; color: #888;">Apache POI</h3>
                    <p style="color: #666; font-size: 0.7rem; margin-top: 0.5rem; font-family: var(--font-mono);">DATA_STREAM_SYNC</p>
                </div>

                <div class="card coming-soon">
                    <div class="card-icon" style="color: #333;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
                    </div>
                    <h3 style="font-size: 1.3rem; font-weight: 800; text-transform: uppercase; margin-top: 1.5rem; color: #888;">Cucumber BDD</h3>
                    <p style="color: #666; font-size: 0.7rem; margin-top: 0.5rem; font-family: var(--font-mono);">BEHAVIOR_ANALYSIS</p>
                </div>

                <div class="card coming-soon">
                    <div class="card-icon" style="color: #333;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12A10 10 0 1 1 12 2a10 10 0 0 1 10 10Z"/><path d="M22 2 12 12"/><path d="M2 12h10"/><path d="m12 12 5 10"/><path d="m12 12-5 10"/></svg>
                    </div>
                    <h3 style="font-size: 1.3rem; font-weight: 800; text-transform: uppercase; margin-top: 1.5rem; color: #888;">DevOps Pipeline</h3>
                    <p style="color: #666; font-size: 0.7rem; margin-top: 0.5rem; font-family: var(--font-mono);">INFRA_ORCHESTRATION</p>
                </div>

                <div class="card coming-soon">
                    <div class="card-icon" style="color: #333;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.4 3 10.2 8 12 5-1.8 8-6.6 8-12a8 8 0 0 0-8-8Z"/><path d="M12 7v6"/><path d="M9 10h6"/></svg>
                    </div>
                    <h3 style="font-size: 1.3rem; font-weight: 800; text-transform: uppercase; margin-top: 1.5rem; color: #888;">GenAI Systems</h3>
                    <p style="color: #666; font-size: 0.7rem; margin-top: 0.5rem; font-family: var(--font-mono);">NEURAL_TRAINING</p>
                </div>
            </div>
        `;
    },

    renderSelection(container) {
        const categoryName = this.currentCategory.toUpperCase();
        container.innerHTML = `
            <div class="dashboard-header" style="margin-bottom: 4rem;">
                <button class="nav-btn" onclick="App.setState('dashboard')" style="margin-bottom: 1rem;">← BACK TO DASHBOARD</button>
                <h1 style="font-size: 3rem; letter-spacing: -0.05em; font-weight: 900; color: var(--accent); text-transform: uppercase;">${categoryName} // SELECTION</h1>
                <p style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.2em; margin-top: 1rem;">Choose your specialization track</p>
            </div>
            
            <div class="dashboard-grid">
                <div class="card selection-card" onclick="App.setState('quiz', { category: '${this.currentCategory}', section: 'mcq' })">
                    <div class="card-icon" style="color: var(--accent); margin-bottom: 1.5rem;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    </div>
                    <h3 style="font-size: 1.8rem; font-weight: 800; text-transform: uppercase;">QUIZ MODE</h3>
                    <p style="color: var(--text-secondary); margin-top: 1rem; font-size: 0.9rem;">Multiple choice questions to test your theoretical foundation.</p>
                    <div style="margin-top: 2rem; font-family: var(--font-mono); font-size: 0.7rem; color: var(--accent);">[ 100 QUESTIONS AVAILABLE ]</div>
                </div>

                <div class="card selection-card" onclick="App.setState('quiz', { category: '${this.currentCategory}', section: 'practice' })">
                    <div class="card-icon" style="color: var(--accent); margin-bottom: 1.5rem;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                    </div>
                    <h3 style="font-size: 1.8rem; font-weight: 800; text-transform: uppercase;">CODE LAB</h3>
                    <p style="color: var(--text-secondary); margin-top: 1rem; font-size: 0.9rem;">Real-world coding challenges and practical implementation.</p>
                    <div style="margin-top: 2rem; font-family: var(--font-mono); font-size: 0.7rem; color: var(--accent);">[ 50 QUESTIONS AVAILABLE ]</div>
                </div>
            </div>
        `;
    },

    async renderInterviews(container) {
        this.setLoading(true);
        let interviews = [];
        try {
            const res = await fetch('/api/interviews/list', {
                headers: Auth.getAuthHeader()
            });
            interviews = await res.json();
        } catch (error) {
            console.error('Error fetching interviews:', error);
        }
        this.setLoading(false);

        const activeInterviews = interviews.filter(i => i.status === 'active');
        const completedInterviews = interviews.filter(i => i.status === 'completed');

        container.innerHTML = `
            <div class="dashboard-header" style="margin-bottom: 4rem;">
                <h1 style="font-size: 3.5rem; letter-spacing: -0.05em; font-weight: 900; color: var(--accent); text-transform: uppercase;">Interview Engine</h1>
                <p style="color: var(--text-secondary); max-width: 600px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.2em; margin-top: 1rem;">Select your evaluation protocol or continue an active session.</p>
            </div>

            <div class="dashboard-grid" style="margin-bottom: 4rem;">
                <!-- Topic Based -->
                <div class="card interview-card" onclick="App.renderTopicInterviewSetup()">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div class="card-icon" style="color: var(--accent);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20"/><path d="m5 15 7-7 7 7"/></svg>
                        </div>
                        <div style="font-family: var(--font-mono); font-size: 0.6rem; color: var(--accent); padding: 0.2rem 0.5rem; border: 1px solid var(--accent); border-radius: 2px;">VIRTUAL_VIBE</div>
                    </div>
                    <h3 style="font-size: 1.5rem; font-weight: 800; text-transform: uppercase; margin-top: 1.5rem;">Topic Based</h3>
                    <p style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 1rem; line-height: 1.5;">Select specific topics to test your depth in Java, Selenium, or SQL.</p>
                    <div style="margin-top: 1.5rem; font-family: var(--font-mono); font-size: 0.6rem; color: var(--accent); opacity: 0.8; letter-spacing: 0.1em; border-top: 1px solid #111; padding-top: 1rem;">
                        [ LIMIT: 1 EVALUATION PER USER ]
                    </div>
                </div>

                <!-- Resume Based -->
                <div class="card interview-card ${this.userProgress.plan !== 'paid' ? 'paid-only' : ''}" onclick="App.renderResumeInterviewSetup()">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div class="card-icon" style="color: var(--accent);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        </div>
                        <div style="font-family: var(--font-mono); font-size: 0.6rem; color: var(--accent); padding: 0.2rem 0.5rem; border: 1px solid var(--accent); border-radius: 2px;">RESUME_SYNC</div>
                    </div>
                    <h3 style="font-size: 1.5rem; font-weight: 800; text-transform: uppercase; margin-top: 1.5rem;">Resume Based</h3>
                    <p style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 1rem; line-height: 1.5;">Personalized AI interviews based on your skills and experience levels.</p>
                </div>

                <!-- Role + Resume Based -->
                <div class="card interview-card coming-soon">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div class="card-icon" style="color: #333;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </div>
                        <div style="font-family: var(--font-mono); font-size: 0.6rem; color: #555; padding: 0.2rem 0.5rem; border: 1px solid #333; border-radius: 2px;">ROLE_SPECIFIC</div>
                    </div>
                    <h3 style="font-size: 1.5rem; font-weight: 800; text-transform: uppercase; margin-top: 1.5rem; color: #555;">Role + Resume Based</h3>
                    <p style="color: #444; font-size: 0.8rem; margin-top: 1rem; line-height: 1.5;">Simulate specialized role interviews (SDET, QA Lead) with resume context.</p>
                </div>

                <!-- Project Based (Coming Soon) -->
                <div class="card interview-card coming-soon">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div class="card-icon" style="color: var(--accent);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        </div>
                        <div style="font-family: var(--font-mono); font-size: 0.6rem; color: #555; padding: 0.2rem 0.5rem; border: 1px solid #333; border-radius: 2px;">IN_CALIBRATION</div>
                    </div>
                    <h3 style="font-size: 1.5rem; font-weight: 800; text-transform: uppercase; margin-top: 1.5rem; color: #555;">Project Based</h3>
                    <p style="color: #444; font-size: 0.8rem; margin-top: 1rem; line-height: 1.5;">Evaluate your practical implementation by uploading your project repository.</p>
                </div>
            </div>

            ${activeInterviews.length > 0 ? `
            <div class="active-sessions-section" style="margin-bottom: 4rem;">
                <h2 style="font-size: 1.2rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent); margin-bottom: 2rem;">Active Sessions <span style="opacity: 0.5;">[ PENDING_CALIBRATION ]</span></h2>
                <div class="dashboard-grid">
                    ${activeInterviews.map(i => `
                        <div class="card interview-card" onclick="App.resumeInterview('${i._id}')">
                            <div style="display: flex; justify-content: space-between;">
                                <div class="card-icon" style="color: var(--accent);">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20"/><path d="m19 9-7 7-7-7"/></svg>
                                </div>
                                <div style="font-family: var(--font-mono); font-size: 0.6rem; color: var(--accent); border: 1px solid var(--accent); background: #000; padding: 0.2rem 0.5rem; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.1em;">RESUME #QC-${i.history.length}/10</div>
                            </div>
                            <h3 style="font-size: 1.3rem; font-weight: 800; text-transform: uppercase; margin-top: 1.5rem;">${i.type === 'topic' ? i.topics.join(' + ') : 'RESUME TRACK'}</h3>
                            <p style="color: var(--text-secondary); font-size: 0.7rem; margin-top: 0.5rem; font-family: var(--font-mono);">Started: ${new Date(i.createdAt).toLocaleDateString()}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            ${completedInterviews.length > 0 ? `
            <div class="history-section" style="margin-top: 6rem;">
                <h2 style="font-size: 1.2rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-secondary); border-bottom: 2px solid #111; padding-bottom: 1rem; margin-bottom: 2rem;">Past Evaluations History</h2>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 0.75rem;">
                        <thead>
                            <tr style="text-align: left; color: var(--accent); border-bottom: 1px solid #222;">
                                <th style="padding: 1rem;">PROTOCOL</th>
                                <th style="padding: 1rem;">DATE</th>
                                <th style="padding: 1rem;">SIGMA_SCORE</th>
                                <th style="padding: 1rem; text-align: right;">ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${completedInterviews.map(i => `
                                <tr style="border-bottom: 1px solid #111;">
                                    <td style="padding: 1.5rem 1rem; text-transform: uppercase; font-weight: 700;">${i.type === 'topic' ? i.topics.join(', ') : 'RESUME_BASED'}</td>
                                    <td style="padding: 1.5rem 1rem; color: var(--text-secondary);">${new Date(i.createdAt).toLocaleDateString()}</td>
                                    <td style="padding: 1.5rem 1rem;"><span style="color: var(--accent); font-weight: 900;">${i.report?.score || 'N/A'}/10</span></td>
                                    <td style="padding: 1.5rem 1rem; text-align: right;">
                                        <button class="btn-primary" style="width: auto; padding: 0.4rem 1rem; font-size: 0.6rem;" onclick="App.renderInterviewReport('${i._id}')">VIEW_REPORT</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            ` : ''}
        `;
    },

    renderTopicInterviewSetup() {
        const content = document.getElementById('content');
        const topics = ['java', 'selenium', 'sql'];
        let selectedTopics = [];

        content.innerHTML = `
            <div class="setup-container">
                <button class="nav-btn" onclick="App.setState('interviews')" style="margin-bottom: 2rem;">← BACK TO TRACKS</button>
                <h2 class="setup-title">Topic Selection</h2>
                <p style="color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 2rem; text-transform: uppercase; letter-spacing: 0.1em;">Choose one or multiple topics for your evaluation session.</p>
                
                <div class="topic-selector">
                    ${topics.map(t => `<button class="topic-btn" data-topic="${t}" onclick="App.toggleTopicSelection(this)">${t}</button>`).join('')}
                </div>

                <div class="form-group">
                    <label>Interviewer Greeting Name</label>
                    <input type="text" id="interview-name" placeholder="Agent Sigma" value="${Auth.empId || ''}">
                </div>

                <button class="btn-primary" style="margin-top: 2rem;" onclick="App.startInterview('topic')">START INTERVIEW</button>
            </div>
        `;
    },

    toggleTopicSelection(btn) {
        btn.classList.toggle('selected');
    },

    renderResumeInterviewSetup() {
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="setup-container">
                <button class="nav-btn" onclick="App.setState('interviews')" style="margin-bottom: 2rem;">← BACK TO TRACKS</button>
                <h2 class="setup-title">Resume Upload</h2>
                <p style="color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 2rem; text-transform: uppercase; letter-spacing: 0.1em;">Upload your resume (PDF/DOCX) to calibrate the AI interviewer.</p>
                
                <div class="file-upload-zone" id="resume-dropzone" onclick="document.getElementById('resume-file').click()">
                    <div style="color: var(--accent); margin-bottom: 1rem;">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    </div>
                    <p style="font-weight: 700; color: #fff;">Click or Drag Resume Here</p>
                    <p style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.5rem;">SUPPORTED: PDF, DOCX (MAX 5MB)</p>
                    <input type="file" id="resume-file" style="display: none;" accept=".pdf,.doc,.docx" onchange="App.handleFileSelect(this)">
                    <div id="file-info" class="file-info"></div>
                </div>

                <div class="form-group">
                    <label>Interviewer Greeting Name</label>
                    <input type="text" id="interview-name" placeholder="Agent Sigma" value="${Auth.empId || ''}">
                </div>

                <button class="btn-primary" style="margin-top: 2rem;" onclick="App.startInterview('resume')">START INTERVIEW</button>
            </div>
        `;
    },

    handleFileSelect(input) {
        const info = document.getElementById('file-info');
        if (input.files && input.files[0]) {
            info.textContent = `SELECTED: ${input.files[0].name.toUpperCase()}`;
        }
    },

    async startInterview(type) {
        const name = document.getElementById('interview-name').value;
        if (!name) return this.notify('Please enter your name', 'error');

        const formData = new FormData();
        formData.append('type', type);
        formData.append('interviewerName', name);

        if (type === 'topic') {
            const selected = Array.from(document.querySelectorAll('.topic-btn.selected')).map(b => b.dataset.topic);
            if (selected.length === 0) return this.notify('Please select at least one topic', 'error');
            formData.append('topics', JSON.stringify(selected));
        } else if (type === 'resume') {
            const fileInput = document.getElementById('resume-file');
            if (!fileInput.files[0]) return this.notify('Please upload your resume', 'error');
            formData.append('resume', fileInput.files[0]);
        }

        this.setLoading(true);
        try {
            // Remove Content-Type header if it exists because FormData needs its own boundary
            const headers = Auth.getAuthHeader();
            delete headers['Content-Type'];

            const res = await fetch('/api/interview/start', {
                method: 'POST',
                headers: headers,
                body: formData
            });

            if (!res.ok) throw new Error('Failed to start interview');
            const data = await res.json();
            this.currentInterviewId = data.interviewId;
            this.currentQuestionCount = 1;

            // Sync credits immediately
            if (data.remainingCredits !== undefined) {
                this.userProgress.interviewCredits = data.remainingCredits;
                this.updateGlobalCredits();
            }

            this.setLoading(false);
            this.renderInterviewSession(data.nextQuestion);
        } catch (error) {
            console.error('Start Interview Error:', error);
            this.setLoading(false);
            this.notify('Failed to start interview system.', 'error');
        }
    },

    async resumeInterview(id) {
        this.setLoading(true);
        try {
            const res = await fetch(`/api/interview/resume/${id}`, {
                headers: Auth.getAuthHeader()
            });
            if (!res.ok) throw new Error('Failed to resume');
            const data = await res.json();

            this.currentInterviewId = data.interviewId;
            this.currentQuestionCount = data.questionCount;
            this.setLoading(false);
            this.renderInterviewSession(data.nextQuestion);
        } catch (error) {
            console.error('Resume Error:', error);
            this.setLoading(false);
            this.notify('Failed to resume session.', 'error');
        }
    },

    renderInterviewSession(data) {
        const content = document.getElementById('content');
        const isCode = data.isCodeRequired;

        content.innerHTML = `
            <div class="setup-container" style="max-width: 1000px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--accent); letter-spacing: 0.2em;">PROTOCOL // SESSION_ACTIVE</div>
                    <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary);">${this.currentQuestionCount} / 10</div>
                </div>

                ${data.feedback ? `
                    <div class="feedback-box revealed" style="margin-bottom: 2rem; border-left-color: var(--accent);">
                        <span style="font-size: 0.7rem; color: var(--accent); display: block; margin-bottom: 0.5rem; letter-spacing: 0.1em;">INTERVIEWER_FEEDBACK:</span>
                        ${data.feedback}
                    </div>
                ` : ''}

                <div class="question-text" style="font-size: 1.5rem; margin-bottom: 2rem; line-height: 1.5;">
                    ${data.question}
                </div>

                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 0.8rem;">
                    <label>${isCode ? 'IMPLEMENTATION_EDITOR' : 'RESPONSE_TERMINAL'}</label>
                    ${!isCode ? `
                        <button class="mic-btn" id="mic-btn" onclick="App.toggleMic()" title="Toggle Voice Input">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                        </button>
                    ` : ''}
                </div>
                <div class="form-group">
                    ${isCode ?
                `<textarea id="interview-answer" class="code-editor" placeholder="Write your code solution here..." style="height: 300px;"></textarea>` :
                `<textarea id="interview-answer" class="code-editor" placeholder="Type or use mic to speak your answer..." style="height: 200px; color: #fff;"></textarea>`
            }
                </div>

                <div style="margin-top: 2rem;">
                    <button class="btn-primary" id="submit-answer-btn" onclick="App.submitInterviewAnswer()">SUBMIT RESPONSE</button>
                </div>
            </div>
        `;
    },

    async submitInterviewAnswer() {
        const answer = document.getElementById('interview-answer').value;
        if (!answer || answer.trim().length < 5) return this.notify('Please provide a more detailed answer', 'warning');

        const btn = document.getElementById('submit-answer-btn');
        btn.disabled = true;
        btn.textContent = 'TRANSMITTING...';
        this.setLoading(true);

        try {
            const res = await fetch('/api/interview/next', {
                method: 'POST',
                headers: { ...Auth.getAuthHeader(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ interviewId: this.currentInterviewId, answer })
            });

            if (!res.ok) throw new Error('Failed to submit answer');
            const data = await res.json();

            if (data.status === 'completed') {
                this.renderInterviewReport(data.report);
            } else {
                this.currentQuestionCount++;
                this.renderInterviewSession(data.nextQuestion);
            }
        } catch (error) {
            console.error('Submit Answer Error:', error);
            this.notify('Technical error during transmission.', 'error');
            btn.disabled = false;
            btn.textContent = 'SUBMIT RESPONSE';
        } finally {
            this.setLoading(false);
        }
    },

    renderInterviewReport(report) {
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="setup-container" style="max-width: 900px; text-align: left;">
                <h1 style="font-size: 3rem; font-weight: 900; color: var(--accent); text-transform: uppercase; margin-bottom: 1rem;">Evaluation Report</h1>
                <p style="color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.7rem; margin-bottom: 3rem;">Session Protocol // Termination_Success</p>

                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 3rem; margin-bottom: 3rem;">
                    <div style="text-align: center; padding: 2rem; border: 1px solid var(--accent); border-radius: 4px; background: rgba(212, 255, 0, 0.05);">
                        <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--accent); margin-bottom: 1rem;">SIGMA_SCORE</div>
                        <div style="font-size: 5rem; font-weight: 950; color: var(--accent);">${report.score}</div>
                        <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-secondary);">OUT OF 10</div>
                    </div>
                    <div>
                        <h3 style="color: #fff; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1rem;">Summary Assessment</h3>
                        <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6;">${report.summary}</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 3rem;">
                    <div class="explanation-box" style="border-left-color: var(--success); background: rgba(0, 255, 102, 0.02);">
                        <h4 style="color: var(--success);">Core Strengths</h4>
                        <ul style="color: var(--text-secondary); font-size: 0.85rem; padding-left: 1rem; line-height: 1.8;">
                            ${report.strengths.map(s => `<li>${s}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="explanation-box" style="border-left-color: var(--danger); background: rgba(255, 0, 51, 0.02);">
                        <h4 style="color: var(--danger);">Growth Zones</h4>
                        <ul style="color: var(--text-secondary); font-size: 0.85rem; padding-left: 1rem; line-height: 1.8;">
                            ${report.improvements.map(i => `<li>${i}</li>`).join('')}
                        </ul>
                    </div>
                </div>

                <div style="display: flex; gap: 1rem;">
                    <button class="btn-primary" onclick="App.setState('dashboard')" style="width: auto;">BACK TO DASHBOARD</button>
                    <button class="btn-secondary" onclick="App.setState('interviews')" style="width: auto;">NEW INTERVIEW</button>
                </div>
            </div>
        `;
    },

    renderPricing(container) {
        container.innerHTML = `
            <div class="pricing-container">
                <div style="text-align: center; margin-bottom: 4rem;">
                    <h2 style="font-size: 3rem; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em;">ACCESS PLANS</h2>
                    <p style="color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.8rem;">Select your expertise elevation protocol</p>
                </div>
                <div class="pricing-grid">
                    <div class="pricing-card">
                        <div class="plan-name">FREE</div>
                        <div class="plan-price">₹0<span>/mo</span></div>
                        <ul class="plan-features">
                            <li>UNLIMITED QUIZ QUESTIONS</li>
                            <li>UNLIMITED CODE CHALLENGES</li>
                            <li>1 FREE TOPIC INTERVIEW</li>
                            <li class="disabled">RESUME-BASED INTERVIEWS</li>
                            <li class="disabled">3 INTERVIEW SESSIONS</li>
                        </ul>
                        <button class="btn-secondary" style="margin-top: auto;">ACTIVE BY DEFAULT</button>
                    </div>
                    <div class="pricing-card premium">
                        <div class="premium-badge">RECOMMENDED</div>
                        <div class="plan-name">ADVANCED</div>
                        <div class="plan-price" id="plan-price-display">₹99<span>/life</span></div>
                        <ul class="plan-features">
                            <li>UNLIMITED QUIZ QUESTIONS</li>
                            <li>UNLIMITED CODE CHALLENGES</li>
                            <li>3 FULL INTERVIEW CREDITS</li>
                            <li>RESUME-BASED AI INTERVIEWS</li>
                            <li>DAILY LIMIT: 1 TOPIC + 1 RESUME</li>
                        </ul>
                        
                        <div class="coupon-section" style="margin-top: 2rem; border-top: 1px solid #111; padding-top: 1.5rem;">
                            <div style="display: flex; gap: 0.5rem;">
                                <input type="text" id="coupon-code" placeholder="ENTER CODE" style="background: #000; border: 1px solid #222; padding: 0.6rem; color: #fff; font-family: var(--font-mono); font-size: 0.6rem; flex: 1;">
                                <button class="btn-primary" style="width: auto; padding: 0 1rem; font-size: 0.6rem;" onclick="App.applyCoupon()">APPLY</button>
                            </div>
                            <div id="coupon-message" style="font-size: 0.5rem; margin-top: 0.5rem; text-transform: uppercase; letter-spacing: 0.1em;"></div>
                        </div>

                        ${this.userProgress.plan === 'paid' ?
                `<button class="btn-secondary" style="margin-top: 2rem; border-color: var(--accent); color: var(--accent); cursor: default !important;">PREMIUM ACTIVE</button>` :
                `<button class="btn-primary" style="margin-top: 2rem;" id="buy-btn" onclick="App.handlePayment()">UPGRADE TO PREMIUM</button>`
            }
                    </div>
                </div>
            </div>
        `;
    },

    async applyCoupon() {
        const code = document.getElementById('coupon-code').value;
        const msg = document.getElementById('coupon-message');
        const priceDisplay = document.getElementById('plan-price-display');

        try {
            const res = await fetch('/api/coupon/validate', {
                method: 'POST',
                headers: { ...Auth.getAuthHeader(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            const data = await res.json();

            if (res.ok) {
                // Animation logic
                priceDisplay.style.transition = 'all 0.5s ease';
                priceDisplay.style.transform = 'scale(0.5) translateY(-20px)';
                priceDisplay.style.opacity = '0';

                setTimeout(() => {
                    priceDisplay.innerHTML = `₹${data.discounted}<span>/life</span>`;
                    priceDisplay.style.color = 'var(--accent)';
                    priceDisplay.style.transform = 'scale(1.2) translateY(0)';
                    priceDisplay.style.opacity = '1';
                    priceDisplay.style.textShadow = '0 0 20px var(--accent-glow)';

                    setTimeout(() => {
                        priceDisplay.style.transform = 'scale(1)';
                    }, 200);
                }, 500);

                this.activeCoupon = code;
                msg.style.color = 'var(--accent)';
                msg.textContent = 'COUPON APPLIED SUCCESSFULLY!';
                this.notify('Coupon applied: Price reduced to ₹9', 'success');
            } else {
                msg.style.color = 'var(--danger)';
                msg.textContent = 'INVALID CODE';
            }
        } catch (err) {
            this.notify('Failed to validate coupon', 'error');
        }
    },

    async handlePayment() {
        this.setLoading(true);
        try {
            // Fetch public key from server
            const keyRes = await fetch('/api/config/razorpay-key');
            const { keyId } = await keyRes.json();

            if (!keyId) throw new Error('Razorpay Key not configured on server');

            const res = await fetch('/api/payment/order', {
                method: 'POST',
                headers: { ...Auth.getAuthHeader(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ couponCode: this.activeCoupon })
            });
            const order = await res.json();

            const options = {
                key: keyId,
                amount: order.amount,
                currency: "INR",
                name: "Interimate Premium",
                description: "Upgrade to Professional Tier",
                order_id: order.id,
                handler: async (response) => {
                    this.setLoading(true);
                    const verifyRes = await fetch('/api/payment/verify', {
                        method: 'POST',
                        headers: { ...Auth.getAuthHeader(), 'Content-Type': 'application/json' },
                        body: JSON.stringify(response)
                    });
                    const verifyData = await verifyRes.json();
                    this.setLoading(false);
                    if (verifyRes.ok) {
                        this.notify(verifyData.message, 'success');
                        this.setState('dashboard');
                    } else {
                        this.notify(verifyData.message, 'error');
                    }
                },
                prefill: {
                    name: Auth.empId,
                    email: "support@interimate.com",
                    contact: ""
                },
                modal: {
                    readonly: {
                        contact: true,
                        email: true
                    },
                    ondismiss: () => {
                        this.setLoading(false);
                    }
                },
                theme: {
                    color: "#d4ff00"
                }
            };

            const rzp = new Razorpay(options);
            rzp.open();
        } catch (error) {
            console.error('Payment Error:', error);
            this.notify(error.message || 'Failed to initialize payment', 'error');
        } finally {
            this.setLoading(false);
        }
    },

    renderFeedback(container) {
        container.innerHTML = `
            <div class="auth-container" style="max-width: 600px;">
                <h2 style="text-align: center;">MISSION FEEDBACK</h2>
                <p style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2rem; text-align: center; text-transform: uppercase; letter-spacing: 0.1em;">HELP US CALIBRATE THE SIGMA ENGINE. SUGGEST TOPICS OR IMPROVEMENTS.</p>
                <div class="form-group">
                    <label>Transmission Content</label>
                    <textarea id="feedback-text" placeholder="I would like to see detailed Java Unit Testing topics... Any suggestions for UI improvements like dark mode persistence?"></textarea>
                </div>
                <button id="send-feedback-btn" class="btn-primary">SEND TRANSMISSION</button>
            </div>
        `;

        document.getElementById('send-feedback-btn').addEventListener('click', async () => {
            const feedback = document.getElementById('feedback-text').value;
            if (!feedback) return App.notify('Please enter your feedback', 'error');

            const btn = document.getElementById('send-feedback-btn');
            btn.disabled = true;
            btn.textContent = 'TRANSMITTING...';

            try {
                const res = await fetch('/api/feedback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...Auth.getAuthHeader()
                    },
                    body: JSON.stringify({ feedback })
                });
                const data = await res.json();
                if (res.ok) {
                    App.notify(data.message, 'success');
                    document.getElementById('feedback-text').value = '';
                } else {
                    throw new Error(data.message);
                }
            } catch (err) {
                App.notify(err.message || 'Transmission failed', 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'SEND TRANSMISSION';
            }
        });
    },

    async renderLeaderboard(container) {
        try {
            const response = await fetch('/api/leaderboard', { headers: Auth.getAuthHeader() });
            const leaders = await response.json();

            container.innerHTML = `
                <div class="leaderboard-container">
                    <div class="dashboard-header" style="margin-bottom: 4rem;">
                        <h1 style="font-size: 3.5rem; letter-spacing: -0.05em; font-weight: 900; color: var(--accent); text-transform: uppercase;">User Rankings</h1>
                        <p style="color: var(--text-secondary); max-width: 600px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.2em; margin-top: 1rem;">Global Performance Rankings</p>
                    </div>
                    <div class="mcq-card">
                        <table class="leaderboard-table">
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>Operative ID</th>
                                    <th>MCQ Score</th>
                                    <th>Practice Score</th>
                                    <th>Total Access Level</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${leaders.map((u, i) => `
                                    <tr>
                                        <td class="${i === 0 ? 'rank-gold' : i === 1 ? 'rank-silver' : i === 2 ? 'rank-bronze' : ''}">#${(i + 1).toString().padStart(2, '0')}</td>
                                        <td>${u.empId}</td>
                                        <td>${u.totalCorrect}</td>
                                        <td>${u.totalPractice}</td>
                                        <td style="color: var(--accent); font-weight: 900;">${u.score}</td>
                                    </tr>
                                `).join('')}
                                ${leaders.length === 0 ? '<tr><td colspan="5" style="text-align:center;">NO DATA AVAILABLE</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                    <button class="btn-primary" style="margin-top: 3rem; width: auto; padding: 1rem 3rem;" onclick="App.setState('dashboard')">RETURN TO DASHBOARD</button>
                </div>
            `;
        } catch (error) {
            console.error('Failed to load leaderboard:', error);
            container.innerHTML = `<div>SYSTEM ERROR: FAILED TO FETCH RANKINGS</div>`;
        }
    },

    toggleMic() {
        const micBtn = document.getElementById('mic-btn');
        const textarea = document.getElementById('interview-answer');

        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            return this.notify('Speech recognition is not supported in your browser.', 'error');
        }

        if (!this.recognition) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    }
                }
                if (finalTranscript) {
                    textarea.value += (textarea.value ? ' ' : '') + finalTranscript;
                }
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                this.stopMic();
            };

            this.recognition.onend = () => {
                this.isListening = false;
                if (micBtn) micBtn.classList.remove('mic-listening');
            };
        }

        if (this.isListening) {
            this.stopMic();
        } else {
            this.startMic();
        }
    },

    startMic() {
        if (this.recognition) {
            try {
                this.recognition.start();
                this.isListening = true;
                const micBtn = document.getElementById('mic-btn');
                if (micBtn) micBtn.classList.add('mic-listening');
                this.notify('Voice Input Active', 'success');
            } catch (err) {
                console.error('Recognition start error:', err);
            }
        }
    },

    stopMic() {
        if (this.recognition) {
            this.recognition.stop();
            this.isListening = false;
            const micBtn = document.getElementById('mic-btn');
            if (micBtn) micBtn.classList.remove('mic-listening');
            this.notify('Voice Input Deactivated', 'info');
        }
    },

    async renderInterviewReport(id) {
        this.setLoading(true);
        try {
            const res = await fetch(`/api/interview/report/${id}`, {
                headers: Auth.getAuthHeader()
            });
            if (!res.ok) throw new Error('Failed to fetch report');
            const interview = await res.json();
            const report = interview.report;

            const content = document.getElementById('content');
            content.innerHTML = `
                <div class="report-container" style="max-width: 900px; margin: 0 auto; padding-bottom: 5rem;">
                    <div class="dashboard-header" style="margin-bottom: 3rem;">
                        <h1 style="font-size: 3rem; font-weight: 950; color: var(--accent); text-transform: uppercase; letter-spacing: -0.05em;">Evaluation Report</h1>
                        <p style="color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.8rem; margin-top: 1rem;">Protocol: ${interview.type.toUpperCase()} // SIGMA_SCORE: <span style="color: #fff; font-weight: 800;">${report.score}/10</span></p>
                    </div>

                    <div class="dashboard-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); margin-bottom: 4rem;">
                        <div class="mcq-card" style="border-left: 4px solid var(--success); flex: 1;">
                            <h4 style="color: var(--success); font-family: var(--font-mono); font-size: 0.75rem; margin-bottom: 1.5rem; text-transform: uppercase;">Key Strengths</h4>
                            <p style="font-size: 0.9rem; line-height: 1.6; color: var(--text-secondary);">${report.strengths}</p>
                        </div>
                        <div class="mcq-card" style="border-left: 4px solid var(--accent); flex: 1;">
                            <h4 style="color: var(--accent); font-family: var(--font-mono); font-size: 0.75rem; margin-bottom: 1.5rem; text-transform: uppercase;">Primary Improvements</h4>
                            <p style="font-size: 0.9rem; line-height: 1.6; color: var(--text-secondary);">${report.improvements}</p>
                        </div>
                    </div>

                    <div class="history-section" style="margin-top: 4rem;">
                        <h2 style="font-size: 1.2rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent); margin-bottom: 2rem;">Full Session Transcript</h2>
                        <div style="display: flex; flex-direction: column; gap: 2rem;">
                            ${interview.history.map((h, i) => `
                                <div class="feedback-box revealed" style="margin-bottom: 0;">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                                        <span style="font-size: 0.6rem; color: var(--accent); font-family: var(--font-mono); text-transform: uppercase;">Question ${i + 1}</span>
                                        ${h.feedback ? `<span style="font-size: 0.6rem; color: var(--text-secondary); font-family: var(--font-mono);">SIGMA_CALIBRATED</span>` : ''}
                                    </div>
                                    <p style="font-weight: 700; color: #fff; margin-bottom: 1.5rem;">${h.question}</p>
                                    <div style="color: var(--text-secondary); padding: 1rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); border-radius: 2px;">
                                        <div style="font-size: 0.6rem; font-family: var(--font-mono); margin-bottom: 0.5rem; color: #555;">USER_RESPONSE:</div>
                                        <p style="font-size: 0.85rem; font-family: var(--font-mono); color: var(--accent);">${h.answer || '[ SKIPPED / NO_RESPONSE ]'}</p>
                                    </div>
                                    ${h.feedback ? `
                                        <div style="margin-top: 1.5rem; font-size: 0.8rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 1rem;">
                                            <span style="font-size: 0.6rem; color: #555; text-transform: uppercase; font-family: var(--font-mono); display: block; margin-bottom: 0.5rem;">INTERVIEWER_NOTE:</span>
                                            ${h.feedback}
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <button class="btn-primary" style="margin-top: 4rem; width: auto; padding: 1rem 3rem;" onclick="App.setState('interviews')">BACK TO ENGINE</button>
                </div>
            `;
        } catch (error) {
            console.error('Report Error:', error);
            this.notify('Failed to load evaluation report', 'error');
        } finally {
            this.setLoading(false);
        }
    },

    renderStaticPage(container, page) {
        window.scrollTo(0, 0);
        const pages = {
            contact: {
                title: 'Contact Us',
                content: `
                    <div class="mcq-card" style="max-width: 800px; margin: 0 auto; text-align: left;">
                        <p style="margin-bottom: 2rem; color: var(--text-secondary);">If you have any questions, concerns, or technical issues, please reach out to our support team.</p>
                        
                        <div style="margin-bottom: 2rem;">
                            <h4 style="color: var(--accent); margin-bottom: 0.5rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;">Communication Channels</h4>
                            <p style="color: #fff; font-size: 1.1rem; font-weight: 700;">support@interimate.com</p>
                        </div>

                        <div style="margin-bottom: 2rem;">
                            <h4 style="color: var(--accent); margin-bottom: 0.5rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;">Operating Address</h4>
                            <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6;">
                                Interimate<br>
                                Gachibowli High-Tech Zone<br>
                                Hyderabad, Telangana, 500032<br>
                                India
                            </p>
                        </div>
                    </div>
                `
            },
            terms: {
                title: 'Terms & Conditions',
                content: `
                    <div class="mcq-card" style="max-width: 800px; margin: 0 auto; text-align: left; font-size: 0.85rem; line-height: 1.8; color: var(--text-secondary);">
                        <p style="margin-bottom: 1.5rem;">Welcome to Interimate. By accessing our platform, you agree to these terms.</p>
                        <h4 style="color: var(--accent); margin-top: 2rem;">1. Use of Service</h4>
                        <p>Interimate is a preparation tool. The content generated by AI is for practice purposes. While we strive for accuracy, users should verify critical information independently.</p>
                        <h4 style="color: var(--accent); margin-top: 2rem;">2. Account Integrity</h4>
                        <p>You are responsible for maintaining the confidentiality of your credentials. Any activity under your account is your responsibility.</p>
                        <h4 style="color: var(--accent); margin-top: 2rem;">3. Intellectual Property</h4>
                        <p>All software, design elements, and AI logic are the exclusive property of Interimate.</p>
                        <h4 style="color: var(--accent); margin-top: 2rem;">4. Prohibited Conduct</h4>
                        <p>Users may not attempt to reverse-engineer, scrap, or disrupt the platform's stability.</p>
                    </div>
                `
            },
            refunds: {
                title: 'Cancellations & Refunds',
                content: `
                    <div class="mcq-card" style="max-width: 800px; margin: 0 auto; text-align: left; font-size: 0.85rem; line-height: 1.8; color: var(--text-secondary);">
                        <h4 style="color: var(--accent); margin-bottom: 1rem;">Cancellation Policy</h4>
                        <p style="margin-bottom: 2rem;">You may stop using the service at any time. There are no recurring subscriptions unless explicitly stated; most upgrades are one-time credit purchases.</p>
                        
                        <h4 style="color: var(--accent); margin-bottom: 1rem;">Refund Policy</h4>
                        <p>Since Interimate provides digital credits and instant AI evaluation services, we generally do not offer refunds once a purchase is completed and credits are added to your account.</p>
                        <p>However, if you experience a technical failure where credits were deducted but no service was provided, please contact <strong>support@interimate.com</strong> within 48 hours for a credit restoration.</p>
                    </div>
                `
            },
            privacy: {
                title: 'Privacy Policy',
                content: `
                    <div class="mcq-card" style="max-width: 800px; margin: 0 auto; text-align: left; font-size: 0.85rem; line-height: 1.8; color: var(--text-secondary);">
                        <h4 style="color: var(--accent); margin-bottom: 1rem;">Data Collection</h4>
                        <p>We collect your email, employee/operative ID, and performance data to track your progress and provide personalized feedback.</p>
                        <h4 style="color: var(--accent); margin-top: 2rem;">AI Processing</h4>
                        <p>Your interview responses and resume text are processed by Google's Gemini AI to generate evaluations. This data is used solely for your session feedback.</p>
                        <h4 style="color: var(--accent); margin-top: 2rem;">Security</h4>
                        <p>We implement industry-standard encryption to protect your data. We do not sell your personal information to third parties.</p>
                    </div>
                `
            }
        };

        const pageData = pages[page] || pages.contact;

        container.innerHTML = `
            <div class="static-page" style="padding-bottom: 5rem;">
                <div class="dashboard-header" style="margin-bottom: 4rem; text-align: center;">
                    <h1 style="font-size: 3.5rem; letter-spacing: -0.05em; font-weight: 900; color: var(--accent); text-transform: uppercase;">${pageData.title}</h1>
                    <div style="width: 50px; height: 2px; background: var(--accent); margin: 2rem auto;"></div>
                </div>
                ${pageData.content}
                <div style="text-align: center; margin-top: 4rem;">
                    <button class="btn-secondary" onclick="App.setState('landing')">RETURN TO HOME</button>
                </div>
            </div>
        `;
    },

    BADGE_METADATA: {
        'GENESIS_CREATOR': { title: 'Genesis Pioneer', description: 'Be the first to synthesize an AI question', stars: 1, color: '#d4ff00' },
        'JAVA_EXPERT': { title: 'Java Grandmaster', description: 'Complete 100% of Java Module', stars: 4, color: '#ff3366' },
        'SELENIUM_EXPERT': { title: 'Selenium Automator', description: 'Complete 100% of Selenium Module', stars: 4, color: '#00ccff' },
        'SQL_EXPERT': { title: 'SQL Architect', description: 'Complete 100% of SQL Module', stars: 4, color: '#9933ff' },
        'QUIZ_50': { title: 'Quiz Initiate', description: 'Solve 50 Theory Questions', stars: 1, color: '#00ffaa' },
        'QUIZ_100': { title: 'Quiz Veteran', description: 'Solve 100 Theory Questions', stars: 2, color: '#00ffaa' },
        'QUIZ_300': { title: 'Quiz Elite', description: 'Solve 300 Theory Questions', stars: 3, color: '#00ffaa' },
        'CODE_50': { title: 'Code Initiate', description: 'Solve 50 Code Challenges', stars: 1, color: '#ffb300' },
        'CODE_100': { title: 'Code Veteran', description: 'Solve 100 Code Challenges', stars: 2, color: '#ffb300' },
        'CODE_300': { title: 'Code Elite', description: 'Solve 150 Code Challenges', stars: 3, color: '#ffb300' },
        'INT_1': { title: 'Evaluation Initiate', description: 'Complete 1 AI Interview Session', stars: 1, color: '#ffffff' },
        'INT_5': { title: 'Combat Veteran', description: 'Complete 5 AI Interview Sessions', stars: 2, color: '#ff6600' },
        'INT_20': { title: 'Tactical Master', description: 'Complete 20 AI Interview Sessions', stars: 4, color: '#ffcc00' },
        'SCORE_90': { title: 'High Performer', description: 'Achieve a score of 90+ in any evaluation', stars: 3, color: '#00ff00' },
        'SCORE_95': { title: 'Elite Candidate', description: 'Achieve a score of 95+ in any evaluation', stars: 5, color: '#00ffee' }
    },

    async renderBadges(container) {
        this.setLoading(true);
        let earnedBadges = [];
        try {
            const res = await fetch('/api/user/badges', { headers: Auth.getAuthHeader() });
            earnedBadges = await res.json();
        } catch (error) {
            console.error('Error fetching badges:', error);
        }
        this.setLoading(false);

        const earnedIds = earnedBadges.map(b => b.id);

        container.innerHTML = `
            <div class="dashboard-header" style="margin-bottom: 4rem;">
                <h1 style="font-size: 3.5rem; letter-spacing: -0.05em; font-weight: 900; color: var(--accent); text-transform: uppercase;">Mission Control</h1>
                <p style="color: var(--text-secondary); max-width: 600px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.2em; margin-top: 1rem;">Protocol Achievements // ${earnedBadges.length} / ${Object.keys(this.BADGE_METADATA).length} SECURED</p>
            </div>
            
            <div class="dashboard-grid">
                ${Object.entries(this.BADGE_METADATA).map(([id, meta]) => {
            const earned = earnedBadges.find(b => b.id === id);
            const isEarned = !!earned;

            return `
                        <div class="card badge-card ${!isEarned ? 'locked' : ''}" 
                             ${isEarned ? `onclick='App.showBadgeHighlight(${JSON.stringify(earned).replace(/'/g, "&apos;")})'` : ''}>
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div class="badge-stars" style="color: ${isEarned ? meta.color : '#111'};">
                                    ${Array(meta.stars).fill('<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>').join('')}
                                </div>
                                <div style="font-family: var(--font-mono); font-size: 0.5rem; color: var(--accent); opacity: ${isEarned ? 0.5 : 0.15};">MODULE: ${id}</div>
                            </div>
                            <h3 style="font-size: 1.5rem; font-weight: 800; text-transform: uppercase; margin-top: 2rem; color: ${isEarned ? '#fff' : '#aaa'}; letter-spacing: -0.02em;">${meta.title}</h3>
                            <p style="color: ${isEarned ? 'var(--text-secondary)' : '#777'}; font-size: 0.75rem; margin-top: 0.5rem; font-family: var(--font-mono); line-height: 1.4;">${meta.description}</p>
                            
                            <div style="margin-top: 2rem; display: flex; justify-content: space-between; align-items: flex-end;">
                                ${isEarned ? `
                                    <span style="font-size: 0.6rem; color: var(--accent); opacity: 0.7; font-family: var(--font-mono); text-transform: uppercase;">SECURED: ${new Date(earned.earnedAt).toLocaleDateString()}</span>
                                    <button class="btn-secondary" style="font-size: 0.6rem; padding: 0.3rem 0.8rem; height: auto;">VIEW AURA</button>
                                ` : `
                                    <span style="font-size: 0.6rem; color: #444; font-family: var(--font-mono); text-transform: uppercase;">PROTOCOL_LOCKED</span>
                                    <div style="color: #666;">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    </div>
                                `}
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    },

    showBadgeHighlight(badge) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="badge-highlight-container">
                <div class="badge-glow" style="background: radial-gradient(circle, ${badge.color || 'var(--accent)'}44 0%, transparent 70%);"></div>
                <div class="badge-modal-content">
                    <div class="badge-interimate">INTERIMATE // SIGMA CORE</div>
                    <div class="badge-star-highlight" style="color: ${badge.color || 'var(--accent)'};">
                        ${Array(badge.stars).fill('<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>').join('')}
                    </div>
                    <h2 class="badge-title-large">${badge.title}</h2>
                    <p class="badge-description-large">${badge.description}</p>
                    <div class="badge-user-info">
                        <div class="verified-label">VERIFIED_RECIPIENT</div>
                        <div class="badge-username">${Auth.empId}</div>
                    </div>
                    <div class="badge-verification-footer">
                        <div>ID: ${badge.verificationId}</div>
                        <div>DATE: ${new Date(badge.earnedAt).toLocaleDateString()}</div>
                    </div>
                    <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()" style="margin-top: 3rem; width: auto; padding: 0.8rem 3rem;">REDACT VIEW</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    }
};

window.onload = () => App.init();
