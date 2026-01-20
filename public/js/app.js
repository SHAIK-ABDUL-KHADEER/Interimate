const App = {
    currentState: 'landing', // landing, login, register, dashboard, selection, quiz, leaderboard
    currentCategory: null,
    currentSection: null, // mcq, practice
    userProgress: {},
    isLoading: false,

    init() {
        this.render();
        this.attachGlobalListeners();
        this.initCursor();
        window.addEventListener('popstate', (e) => this.handlePopState(e));
        history.replaceState({ state: this.currentState, params: {} }, '');
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
            if (e.target.closest('button, a, .card, .landing-card, input, textarea, [role="button"]')) {
                dot.classList.add('cursor-hover');
                outline.classList.add('cursor-hover');
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.closest('button, a, .card, .landing-card, input, textarea, [role="button"]')) {
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
        document.getElementById('nav-dashboard').addEventListener('click', () => this.setState('dashboard'));
        document.getElementById('nav-interviews').addEventListener('click', () => this.setState('interviews'));
        document.getElementById('nav-pricing').addEventListener('click', () => this.setState('pricing'));
        document.getElementById('nav-feedback').addEventListener('click', () => this.setState('feedback'));
        document.getElementById('nav-leaderboard').addEventListener('click', () => this.setState('leaderboard'));
        document.getElementById('nav-logout').addEventListener('click', () => Auth.logout());
    },

    async setState(state, params = {}, pushHistory = true) {
        this.currentState = state;
        this.setLoading(true);
        if (state === 'dashboard' || state === 'leaderboard' || state === 'selection') {
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
        } catch (error) {
            console.error('Failed to load progress:', error);
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
            case 'selection':
                this.renderSelection(content);
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
                <p style="color: var(--text-secondary); max-width: 600px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.2em; margin-top: 1rem;">User: ${Auth.empId} // Cohort: QEA26QE006 // Status: Training in Progress</p>
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

    renderInterviews(container) {
        container.innerHTML = `
            <div style="height: 60vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
                <div style="font-family: var(--font-mono); color: var(--accent); font-size: 0.8rem; letter-spacing: 0.5em; margin-bottom: 2rem; text-transform: uppercase; opacity: 0.6;">MODULE // CAREER_GENESIS</div>
                <h1 style="font-size: 6rem; font-weight: 900; color: var(--accent); text-transform: uppercase; letter-spacing: -0.05em; line-height: 0.9;">COMING<br>VERY SOON</h1>
                <p style="color: var(--text-secondary); max-width: 500px; margin-top: 2rem; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.1em;">The automated interview simulation engine is currently undergoing neural calibration. Prepare for topic-based and resume-synced sessions.</p>
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
                        <div class="plan-price">₹99<span>/life</span></div>
                        <ul class="plan-features">
                            <li>UNLIMITED QUIZ QUESTIONS</li>
                            <li>UNLIMITED CODE CHALLENGES</li>
                            <li>3 INTERVIEW SESSIONS</li>
                            <li>RESUME-BASED AI INTERVIEWS</li>
                            <li>TOPIC-BASED INTERVIEWS</li>
                        </ul>
                        <button class="btn-primary" style="margin-top: auto;">UPGRADE NOW</button>
                    </div>
                </div>
            </div>
        `;
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
    }
};

window.onload = () => App.init();
