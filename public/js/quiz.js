const Quiz = {
    category: null,
    section: null,
    questions: { mcq: [], practice: [] },
    currentIndex: 0,
    competitionMode: false,
    competitionTeam: null,
    competitionResponses: [],
    container: null,
    loading: false,
    processing: false,

    formatText(str) {
        if (!str) return '';
        // 1. Escape HTML entities to prevent injection
        let escaped = str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

        // 2. Convert triple backticks to pre/code blocks
        escaped = escaped.replace(/&lt;pre&gt;&lt;code&gt;([\s\S]*?)&lt;\/code&gt;&lt;\/pre&gt;/g, '<pre><code>$1</code></pre>');
        escaped = escaped.replace(/```(?:[a-z]*)\n?([\s\S]*?)\n?```/g, '<pre><code>$1</code></pre>');

        // 3. Convert single backticks to code tags
        escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

        return escaped;
    },

    async init(category, section, container) {
        // --- RESET ALL STATE TO PREVENT LEAKAGE ---
        this.competitionMode = false;
        this.competitionTeam = null;
        this.competitionResponses = [];
        this.currentCompQuestion = null;
        this.currentIndex = 0;
        this.errorMessage = null;
        this.loading = false;
        this.processing = false;

        this.category = category;
        this.section = section || 'mcq';
        this.container = container;
        this.loading = true;
        this.render(); // Show loading state
        await this.loadQuestions();
        this.loading = false;

        // --- AUTO-RESUME LOGIC ---
        const currentQuestions = this.questions[this.section] || [];
        let firstUnsolved = 0;
        if (currentQuestions.length > 0) {
            for (let i = 0; i < currentQuestions.length; i++) {
                if (!this.isQuestionCompleted(currentQuestions[i].id)) {
                    firstUnsolved = i;
                    break;
                }
                firstUnsolved = i; // If all solved, point to the last one
            }
        }
        this.currentIndex = firstUnsolved;

        this.render();
    },

    async initCompetition(team) {
        // --- RESET ALL STATE TO PREVENT LEAKAGE ---
        this.competitionMode = true;
        this.competitionTeam = team;
        this.competitionResponses = team.responses || [];
        this.currentIndex = this.competitionResponses.length; // Intelligent Resumption
        this.currentCompQuestion = null;
        this.errorMessage = null;
        this.loading = false;
        this.processing = false;

        this.category = team.topic;
        this.container = document.getElementById('content');

        if (this.currentIndex >= 25) {
            // Already finished
            this.finishCompetition();
            return;
        }

        // Only show full-screen loader if we're starting fresh (Q1)
        if (this.currentIndex === 0) {
            this.loading = true;
            this.render();
        }

        await this.loadCompetitionQuestion();
    },

    async loadCompetitionQuestion() {
        const isFirstLoad = !this.currentCompQuestion;

        App.setLoading(true); // Always show cursor loading

        try {
            const res = await fetch(`/api/competition/question?teamName=${this.competitionTeam.teamName}&index=${this.currentIndex + 1}`);
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || "Tactical Sync Interrupted.");
            }
            const data = await res.json();
            this.currentCompQuestion = data;
        } catch (err) {
            this.errorMessage = "Failed to synchronize competition data: " + err.message;
        } finally {
            this.loading = false; // Critical: Ensure Initializing screen is cleared
            App.setLoading(false);
            this.render();
        }
    },

    async loadQuestions() {
        try {
            const response = await fetch(`/api/questions/${this.category}`, {
                headers: Auth.getAuthHeader()
            });

            console.log('--- SIGMA_NETWORK_TRACE ---');
            console.log('URL:', `/api/questions/${this.category}`);
            console.log('STATUS:', response.status);
            console.log('SIGMA_HEADER:', response.headers.get('X-Core-Sigma'));

            if (!response.ok) {
                const err = await response.json();
                if (response.status === 401 || response.status === 403) Auth.logout();
                throw new Error(err.message || 'Failed to sync with AI engine.');
            }

            const data = await response.json();
            if (data.newBadges) App.showBadgeUnlockNotification(data.newBadges);
            console.log('BODY:', data);

            this.questions = data;
        } catch (error) {
            console.error('Failed to load questions:', error);
            this.errorMessage = error.message;
        }
    },

    setSection(section) {
        this.section = section;
        this.currentIndex = 0;
        this.render();
    },

    render() {
        if (this.loading) {
            this.container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; color: var(--accent); font-family: var(--font-mono);">
                    <div class="loading-spinner" style="margin-bottom: 2rem;"></div>
                    <div style="font-size: 1.2rem; letter-spacing: 0.2em; text-transform: uppercase;">Initializing Module...</div>
                    <div style="font-size: 0.7rem; margin-top: 1rem; color: var(--text-secondary); opacity: 0.7;">SECURE SYNC IN PROGRESS</div>
                </div>
            `;
            return;
        }

        const currentQuestions = this.questions[this.section] || [];

        // --- ERROR STATE RENDERING ---
        if (this.errorMessage) {
            this.container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; text-align: center; padding: 2rem;">
                    <div style="font-size: 2rem; color: var(--danger); font-weight: 900; margin-bottom: 2rem; text-transform: uppercase;">SYNTHESIS FAILURE</div>
                    <p style="color: var(--text-secondary); max-width: 500px; margin-bottom: 3rem; font-family: var(--font-mono); line-height: 1.8;">
                        [ ERROR ]: ${this.errorMessage}
                    </p>
                    <div style="display: flex; gap: 1rem;">
                        <button class="btn-primary" onclick="${this.competitionMode ? 'Quiz.loadCompetitionQuestion()' : `Quiz.init('${this.category}', '${this.section}', Quiz.container)`}" style="width: auto; padding: 1rem 3rem;">RETRY SYNC</button>
                        <button class="btn-secondary" onclick="App.setState('selection')" style="width: auto; padding: 1rem 3rem;">ABORT TO SELECTION</button>
                    </div>
                </div>`;
            return;
        }

        // SYNTHESIS FAILURE CHECK (Missing Data)
        if (!this.competitionMode && currentQuestions.length === 0) {
            this.container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; text-align: center; padding: 2rem;">
                    <div style="font-size: 2rem; color: var(--danger); font-weight: 900; margin-bottom: 2rem; text-transform: uppercase;">MODULE_EXTRACTION_FAILURE</div>
                    <p style="color: var(--text-secondary); max-width: 500px; margin-bottom: 3rem; font-family: var(--font-mono); line-height: 1.8;">
                        No data found for this module in the AI core.
                    </p>
                    <button class="btn-secondary" onclick="App.setState('selection')" style="width: auto; padding: 1rem 3rem;">RETURN TO SELECTION</button>
                </div>`;
            return;
        }

        if (this.competitionMode && !this.currentCompQuestion) {
            // This case should be handled by the loading state, 
            // but if we're here, it means something went wrong.
            this.errorMessage = "Competition data is currently unavailable.";
            this.render();
            return;
        }

        const q = this.competitionMode ? this.currentCompQuestion : currentQuestions[this.currentIndex];

        // Safeguard if q is still null somehow
        if (!q) return;
        this.container.innerHTML = `
            <div class="quiz-header">
                <div>
                    <button class="nav-btn" onclick="App.setState('selection')">← SELECTION</button>
                    <h2 style="margin-top: 0.5rem;">${this.category.toUpperCase()} // ${this.section.toUpperCase()} <span style="font-size: 0.6rem; color: var(--accent); opacity: 0.5; margin-left: 1rem;">SIGMA [v3.0]</span></h2>
                </div>
                <div style="text-align: right;">
                    <div class="tabs-container" style="margin-bottom: 0;">
                        <button class="tab-btn ${this.section === 'mcq' ? 'active' : ''}" onclick="Quiz.setSection('mcq')">MCQ</button>
                        <button class="tab-btn ${this.section === 'practice' ? 'active' : ''}" onclick="Quiz.setSection('practice')">Practice</button>
                    </div>
                    <div class="q-navigation" style="margin-top: 1rem;">
                        <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary); margin-right: 1.5rem;">PROGRESS: ${currentQuestions.filter(q => this.isQuestionCompleted(q.id)).length} / ${currentQuestions.length}</span>
                        
                        <!-- Custom Dropdown (Dropbox) -->
                        <div class="custom-dropdown" id="q-dropdown">
                            <button class="dropdown-trigger" onclick="Quiz.toggleDropdown()">
                                <span>QUESTION ${this.currentIndex + 1}</span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                            </button>
                            <div class="dropdown-menu" id="q-dropdown-menu">
                                ${currentQuestions.map((q, i) => {
            const isCorrect = this.isQuestionCompleted(q.id);
            return `
                                        <div class="dropdown-item ${i === this.currentIndex ? 'active' : ''}" onclick="Quiz.jumpTo(${i})">
                                            <span class="q-num">#${(i + 1).toString().padStart(2, '0')}</span>
                                            <span class="q-title">${q.title || q.question.substring(0, 30) + '...'}</span>
                                            ${isCorrect ? '<span class="q-status">✓</span>' : ''}
                                        </div>
                                    `;
        }).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="quiz-layout">
                <button class="side-nav-btn prev quiz-btn-desktop" ${this.currentIndex === 0 ? 'disabled' : ''} onclick="Quiz.prev()" title="Previous Question">
                    <span class="arrow">&lt;</span>
                </button>
                
                <div class="quiz-content">
                    ${this.competitionMode ? this.renderCompMCQ(this.currentCompQuestion) : (this.section === 'mcq' ? this.renderMCQ(q) : this.renderPractice(q))}
                </div>

                <div class="mobile-quiz-nav">
                    <button class="side-nav-btn prev" ${this.currentIndex === 0 ? 'disabled' : ''} onclick="Quiz.prev()">
                        <span class="arrow">&lt;</span>
                    </button>
                    ${(() => {
                const isLast = this.currentIndex === currentQuestions.length - 1;
                const limit = this.section === 'mcq' ? 100 : 50;
                const canGenerate = currentQuestions.length < limit;
                if (isLast && canGenerate) {
                    return `<button class="side-nav-btn next generate-mode" onclick="Quiz.next()"><span class="arrow">＋</span></button>`;
                } else {
                    return `<button class="side-nav-btn next" ${isLast ? 'disabled' : ''} onclick="Quiz.next()"><span class="arrow">&gt;</span></button>`;
                }
            })()}
                </div>

                ${(() => {
                const isLast = this.currentIndex === currentQuestions.length - 1;
                const limit = this.section === 'mcq' ? 100 : 50;
                const canGenerate = currentQuestions.length < limit;
                if (isLast && canGenerate) {
                    return `<button class="side-nav-btn next quiz-btn-desktop generate-mode" onclick="Quiz.next()" title="Generate Next Question"><span class="arrow">＋</span></button>`;
                } else {
                    return `<button class="side-nav-btn next quiz-btn-desktop" ${isLast && !canGenerate ? 'disabled' : ''} onclick="Quiz.next()" title="Next Question"><span class="arrow">&gt;</span></button>`;
                }
            })()}
            </div>

            <div class="quiz-footer" style="justify-content: center; border-top: 1px solid var(--border); padding-top: 2rem;">
                <div class="status-indicator" id="quiz-status" style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--accent); text-transform: uppercase; letter-spacing: 0.2em;">
                    ${this.isQuestionCompleted(q.id) ? '● QUESTION SECURED' : '○ STATUS: PENDING'}
                </div>
            </div>
        `;
    },

    isQuestionCompleted(id) {
        const prog = App.userProgress[this.category]?.[this.section]?.[id];
        return prog && prog.status === 'correct';
    },

    renderMCQ(q) {
        const userResp = (App.userProgress[this.category]?.mcq?.[q.id]) || null;
        const isAnswered = !!userResp;

        return `
            <div class="mcq-card">
                <p class="question-text">${this.formatText(q.question)}</p>
                <div class="options-list">
                    ${q.options.map((opt, i) => {
            let cls = '';
            if (isAnswered) {
                if (i === q.answer) cls = 'correct';
                else if (i === userResp.response && i !== q.answer) cls = 'incorrect';
            }
            return `
                            <button class="option-btn ${cls}" ${isAnswered ? 'disabled' : ''} onclick="Quiz.submitMCQ(${i})">
                                <span style="color: var(--accent); margin-right: 1rem; font-weight: 800;">${String.fromCharCode(65 + i)}</span> ${this.formatText(opt)}
                            </button>
                        `;
        }).join('')}
                </div>
                <div style="margin-top: 1.5rem; display: flex; gap: 1rem;">
                    ${!isAnswered ? `<button class="btn-secondary" onclick="Quiz.revealMCQ()">SHOW ANSWER</button>` : ''}
                </div>
                ${isAnswered ? `
                    <div class="explanation-box" id="mcq-explanation">
                        <h4>Transmission Intelligence</h4>
                        <p style="font-size: 0.9rem; line-height: 1.6;">${this.formatText(q.explanation)}</p>
                    </div>
                ` : ''}
            </div>
        `;
    },

    revealMCQ() {
        const q = this.questions[this.section][this.currentIndex];
        // We set as incorrect with a special flag if we want, or just render it
        this.saveProgress('mcq', q.id, 'revealed', -1).then(() => this.render());
    },

    renderPractice(q) {
        const userResp = (App.userProgress[this.category]?.practice?.[q.id]) || null;
        const isAttempted = !!userResp;
        const isCorrect = userResp && userResp.status === 'correct';

        return `
            <div class="practice-card">
                <h3 style="color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1rem;">${this.formatText(q.title)}</h3>
                <p style="color: var(--text-secondary); margin-bottom: 2rem; font-size: 0.9rem;">${this.formatText(q.description)}</p>
                <div style="position: relative;">
                    <textarea id="code-editor" class="code-editor" spellcheck="false" ${isAttempted ? 'disabled' : ''}>${userResp ? userResp.response : q.template}</textarea>
                    <div style="position: absolute; top: 1rem; right: 1rem; font-family: var(--font-mono); font-size: 0.6rem; color: #333; pointer-events: none;">NEON-OS // v1.1.0</div>
                </div>
                <div id="practice-feedback" class="feedback-box ${isAttempted ? '' : 'hidden'} ${isCorrect ? 'success' : 'danger'}">
                    ${isAttempted ? `
                        <p style="font-weight: 800; margin-bottom: 0.5rem; text-transform: uppercase;">${isCorrect ? 'PASSED // EXECUTION SUCCESSFUL' : 'FAILED // AI REVIEW COMPLETE'}</p>
                        <div style="font-size: 0.85rem; line-height: 1.6; white-space: pre-wrap;">${userResp.feedback || 'No detailed feedback preserved.'}</div>
                    ` : ''}
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                    ${!isAttempted ? `
                        <button class="btn-primary" style="width: auto; padding: 1rem 3rem;" onclick="Quiz.submitPractice()">EXECUTE CODE</button>
                    ` : `<button class="btn-secondary" disabled style="opacity: 0.5;">ATTEMPT CONSUMED</button>`}
                </div>
            </div>
        `;
    },

    async submitMCQ(optionIndex) {
        if (this.processing) return;
        this.processing = true;

        const q = this.questions[this.section][this.currentIndex];
        const isCorrect = optionIndex === q.answer;

        await this.saveProgress('mcq', q.id, isCorrect ? 'correct' : 'incorrect', optionIndex);
        this.processing = false;
        this.render();
    },

    async submitPractice(isConfirmed = false) {
        if (this.processing) return;
        const q = this.questions[this.section][this.currentIndex];
        const code = document.getElementById('code-editor').value;
        const feedbackEl = document.getElementById('practice-feedback');

        if (!isConfirmed) {
            App.notify("CLEARANCE REQUIRED: You only have ONE ATTEMPT per challenge. Click again to AUTHORIZE execution.", "warning");
            const btn = document.querySelector('.btn-primary');
            if (btn) {
                btn.textContent = "AUTHORIZE EXECUTION";
                btn.onclick = () => this.submitPractice(true);
                btn.classList.add('pulse-glow');
            }
            return;
        }

        if (code.trim() === q.template.trim()) {
            feedbackEl.innerHTML = `<p style="color: var(--danger);">SYSTEM ERROR: NO MODIFICATIONS DETECTED.</p>`;
            feedbackEl.classList.remove('hidden');
            // Reset button if they failed the check
            const btn = document.querySelector('.btn-primary');
            if (btn) {
                btn.textContent = "EXECUTE CODE";
                btn.onclick = () => this.submitPractice(false);
                btn.classList.remove('pulse-glow');
            }
            return;
        }

        this.processing = true;
        const submitBtn = document.querySelector('.btn-primary');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "ANALYZING...";
        }

        feedbackEl.innerHTML = `<p style="color: var(--accent);">SYSTEM: ANALYZING SUBMISSION...</p>`;
        feedbackEl.classList.remove('hidden');

        try {
            const response = await fetch('/api/validate', {
                method: 'POST',
                headers: { ...Auth.getAuthHeader(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: this.category,
                    title: q.title,
                    description: q.description,
                    userCode: code
                })
            });

            const result = await response.json();
            await this.saveProgress('practice', q.id, result.isCorrect ? 'correct' : 'incorrect', code, result.feedback);
            this.processing = false;
            this.render();
        } catch (error) {
            console.error('Validation failed:', error);
            this.processing = false;
            feedbackEl.innerHTML = `<p style="color: var(--danger);">CRITICAL ERROR: AI CORE DISCONNECTED.</p>`;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "RETRY EXECUTION";
            }
        }
    },

    async saveProgress(section, questionId, status, response, feedback = null) {
        try {
            const response_raw = await fetch('/api/progress', {
                method: 'POST',
                headers: { ...Auth.getAuthHeader(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: this.category,
                    section,
                    questionId,
                    status,
                    response,
                    feedback
                })
            });
            if (!response_raw.ok) {
                const err = await response_raw.json();
                if (response_raw.status === 401 || response_raw.status === 403) Auth.logout();
                throw new Error(err.message || 'Progress update rejected');
            }
            const res = await response_raw.json();
            if (res.newBadges) App.showBadgeUnlockNotification(res.newBadges);

            // Invalidate leaderboard cache since progress has changed
            App.invalidateLeaderboardCache();

            if (!App.userProgress[this.category]) App.userProgress[this.category] = { mcq: {}, practice: {} };
            App.userProgress[this.category][section][questionId] = { status, response, feedback };
        } catch (error) {
            console.error('Failed to save progress:', error);
        }
    },

    prev() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.render();
        }
    },

    async next() {
        const currentQuestions = this.questions[this.section] || [];
        if (this.currentIndex < currentQuestions.length - 1) {
            this.currentIndex++;
            this.render();
        } else {
            // Check if we can generate more
            const limit = this.section === 'mcq' ? 100 : 50;
            if (currentQuestions.length < limit) {
                await this.fetchNextQuestion();
            } else {
                App.notify(`Maximum limit of ${limit} questions reached for this category.`, 'warning');
            }
        }
    },

    async fetchNextQuestion() {
        const nextBtn = document.getElementById('next-btn');
        const statusEl = document.getElementById('quiz-status');
        const type = this.section === 'mcq' ? 'quiz' : 'code';

        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.innerHTML = '<span style="font-size: 1rem; font-weight: 800; opacity: 1;">...</span>';
        }
        if (statusEl) {
            statusEl.innerHTML = '<span style="color: var(--accent); font-weight: 800; animation: pulse 1s infinite;">STATUS: GENERATING NEXT QUESTION... PLEASE WAIT</span>';
        }

        App.setLoading(true);
        try {
            const response = await fetch(`/api/questions/${this.category}/next`, {
                method: 'POST',
                headers: { ...Auth.getAuthHeader(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ type })
            });

            if (!response.ok) {
                const err = await response.json();
                if (response.status === 401 || response.status === 403) Auth.logout();
                throw new Error(err.message || 'Failed to generate');
            }

            const data = await response.json();
            if (data.newBadges) App.showBadgeUnlockNotification(data.newBadges);

            const newQuestion = data;
            this.questions[this.section].push(newQuestion);
            this.currentIndex = this.questions[this.section].length - 1;
            App.setLoading(false);
            this.render();
        } catch (error) {
            console.error('Failed to fetch next question:', error);
            App.setLoading(false);
            App.notify('Error generating next question. Please try again.', 'error');
            this.render();
        }
    },

    jumpTo(index) {
        this.currentIndex = parseInt(index);
        this.render();
    },

    toggleDropdown() {
        const menu = document.getElementById('q-dropdown-menu');
        const trigger = document.querySelector('.dropdown-trigger');
        if (menu) {
            const isOpen = menu.classList.contains('show');
            // Close all first
            document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
            document.querySelectorAll('.dropdown-trigger').forEach(t => t.classList.remove('open'));

            if (!isOpen) {
                menu.classList.add('show');
                trigger.classList.add('open');
            }
        }
    },

    renderCompMCQ(q) {
        if (!q) return `<div class="loading-spinner"></div>`;
        const score = this.competitionResponses.filter(r => r.isCorrect).length;

        return `
            <div class="mcq-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <p style="font-family: var(--font-mono); font-size: 0.6rem; color: var(--accent); opacity: 0.6; margin: 0;">MISSION: ${this.competitionTeam?.teamName || 'N/A'} // PROTOCOL: Q${this.currentIndex + 1}/25</p>
                    <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--success); font-weight: 800; border: 1px solid var(--success); padding: 2px 10px; border-radius: 2px; box-shadow: 0 0 10px rgba(0,255,102,0.2);">LIVE_SCORE: ${score}</div>
                </div>
                <p class="question-text">${this.formatText(q.question)}</p>
                <div class="options-list" id="comp-options-list">
                    ${q.options.map((opt, i) => `
                        <button class="option-btn" id="option-${i}" onclick="Quiz.submitCompMCQ(${i})">
                            <span style="color: var(--accent); margin-right: 1rem; font-weight: 800;">${String.fromCharCode(65 + i)}</span> ${this.formatText(opt)}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    },

    async submitCompMCQ(idx) {
        if (this.processing) return;
        this.processing = true;

        const q = this.currentCompQuestion;
        const isCorrect = idx === q.answer;

        // --- VISUAL FEEDBACK ---
        const buttons = document.querySelectorAll('.option-btn');
        buttons.forEach((btn, i) => {
            btn.disabled = true;
            if (i === q.answer) btn.classList.add('correct');
            else if (i === idx) btn.classList.add('incorrect');
        });

        this.competitionResponses.push({
            question: q.question,
            userAnswer: q.options[idx],
            correctAnswer: q.options[q.answer],
            isCorrect: isCorrect
        });

        // --- REAL-TIME SYNC ---
        const score = this.competitionResponses.filter(r => r.isCorrect).length;
        const percentage = (score / 25) * 100;

        try {
            fetch('/api/competition/update-progress', {
                method: 'POST',
                headers: { ...Auth.getAuthHeader(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teamName: this.competitionTeam.teamName,
                    responses: this.competitionResponses,
                    score,
                    percentage
                })
            }); // Fire and forget for speed
        } catch (e) { console.error("Sync partial failure"); }

        // --- TRANSITION ---
        setTimeout(async () => {
            if (this.currentIndex < 24) {
                this.currentIndex++;
                await this.loadCompetitionQuestion();
            } else {
                await this.finishCompetition();
            }
            this.processing = false;
        }, 1200); // 1.2s pause to see feedback
    },

    async finishCompetition() {
        this.loading = true;
        this.render();

        const score = this.competitionResponses.filter(r => r.isCorrect).length;
        const percentage = (score / 25) * 100;

        try {
            await fetch('/api/competition/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teamName: this.competitionTeam.teamName,
                    responses: this.competitionResponses,
                    score,
                    percentage
                })
            });

            this.container.innerHTML = `
                <div class="hero">
                    <h2 class="hero-title">MISSION_COMPLETE</h2>
                    <p class="hero-subtitle">THANK YOU FOR TAKING THE QUIZ. YOUR RESPONSES HAVE BEEN RECORDED.</p>
                    <p style="color: var(--accent); margin-top: 2rem; font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.3em;">KINDLY WAIT FOR THE OFFICIAL RESULT RELEASE.</p>
                    <button class="btn-primary" style="width: auto; margin-top: 3rem;" onclick="App.setState('dashboard')">RETURN_TO_BASE</button>
                </div>
            `;
        } catch (err) {
            App.notify("Submission Sync Error. Data saved locally.", "error");
        }
    }
};

// Close dropdown on click outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('#q-dropdown')) {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
        document.querySelectorAll('.dropdown-trigger').forEach(t => t.classList.remove('open'));
    }
});
