const Quiz = {
    category: null,
    section: null,
    questions: { mcq: [], practice: [] },
    currentIndex: 0,
    container: null,
    loading: false,

    async init(category, section, container) {
        this.category = category;
        this.section = section || 'mcq';
        this.container = container;
        this.currentIndex = 0;
        this.loading = true;
        this.render(); // Show loading state
        await this.loadQuestions();
        this.loading = false;
        this.render();
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

            const data = await response.json();
            console.log('BODY:', data);

            if (!response.ok) {
                throw new Error(data.message || 'Failed to sync with AI engine.');
            }

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
        if (currentQuestions.length === 0) {
            this.container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; text-align: center; padding: 2rem;">
                    <div style="font-size: 2rem; color: var(--danger); font-weight: 900; margin-bottom: 2rem; text-transform: uppercase;">SYNTHESIS FAILURE</div>
                    <p style="color: var(--text-secondary); max-width: 500px; margin-bottom: 3rem; font-family: var(--font-mono); line-height: 1.8;">
                        [ ERROR ]: ${this.errorMessage || 'Unknown extraction error detected in the AI core.'}
                    </p>
                    <div style="display: flex; gap: 1rem;">
                        <button class="btn-primary" onclick="Quiz.init('${this.category}', '${this.section}', Quiz.container)" style="width: auto; padding: 1rem 3rem;">RETRY SYNC</button>
                        <button class="btn-secondary" onclick="App.setState('selection')" style="width: auto; padding: 1rem 3rem;">ABORT TO SELECTION</button>
                    </div>
                </div>`;
            return;
        }

        const q = currentQuestions[this.currentIndex];
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
                        <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary); margin-right: 1rem;">QUESTION ${this.currentIndex + 1} / ${currentQuestions.length}</span>
                        <select id="q-jump" onchange="Quiz.jumpTo(this.value)" style="background: #000; color: var(--accent); border: 1px solid var(--border); padding: 0.2rem; cursor: pointer;">
                            ${currentQuestions.map((q, i) => {
            const prog = App.userProgress[this.category]?.[this.section]?.[q.id];
            const isCorrect = prog && prog.status === 'correct';
            return `<option value="${i}" ${i === this.currentIndex ? 'selected' : ''}>QUESTION ${i + 1} ${isCorrect ? '✓' : ''}</option>`;
        }).join('')}
                        </select>
                    </div>
                </div>
            </div>

            <div class="quiz-layout">
                <button class="side-nav-btn prev" ${this.currentIndex === 0 ? 'disabled' : ''} onclick="Quiz.prev()" title="Previous Question">
                    <span class="arrow">&lt;</span>
                </button>
                
                <div class="quiz-content">
                    ${this.section === 'mcq' ? this.renderMCQ(q) : this.renderPractice(q)}
                </div>

                ${(() => {
                const isLast = this.currentIndex === currentQuestions.length - 1;
                const limit = this.section === 'mcq' ? 100 : 50;
                const canGenerate = currentQuestions.length < limit;

                return `
                    <button class="side-nav-btn next ${isLast && canGenerate ? 'generate-mode' : ''}" 
                            ${isLast && !canGenerate ? 'disabled' : ''} 
                            onclick="Quiz.next()" 
                            id="next-btn"
                            title="${isLast && canGenerate ? 'Generate Next Question' : 'Next Question'}">
                        <span class="arrow" id="next-arrow">${isLast && canGenerate ? '＋' : '&gt;'}</span>
                    </button>
                    `;
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
                <p class="question-text">${q.question}</p>
                <div class="options-list">
                    ${q.options.map((opt, i) => {
            let cls = '';
            if (isAnswered) {
                if (i === q.answer) cls = 'correct';
                else if (i === userResp.response && i !== q.answer) cls = 'incorrect';
            }
            return `
                            <button class="option-btn ${cls}" ${isAnswered ? 'disabled' : ''} onclick="Quiz.submitMCQ(${i})">
                                <span style="color: var(--accent); margin-right: 1rem; font-weight: 800;">${String.fromCharCode(65 + i)}</span> ${opt}
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
                        <p style="font-size: 0.9rem; line-height: 1.6;">${q.explanation}</p>
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
                <h3 style="color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1rem;">${q.title}</h3>
                <p style="color: var(--text-secondary); margin-bottom: 2rem; font-size: 0.9rem;">${q.description}</p>
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
        const q = this.questions[this.section][this.currentIndex];
        const isCorrect = optionIndex === q.answer;

        await this.saveProgress('mcq', q.id, isCorrect ? 'correct' : 'incorrect', optionIndex);
        this.render();
    },

    async submitPractice() {
        const q = this.questions[this.section][this.currentIndex];
        const code = document.getElementById('code-editor').value;
        const feedbackEl = document.getElementById('practice-feedback');

        // Confirm gate to save user tokens
        if (!confirm("ARE YOU SURE TO EXECUTE YOUR CODE?\n\nYou only have ONE ATTEMPT per challenge. The system will perform a thorough technical review of your snippet. Consuming 1 session token...")) {
            return;
        }

        if (code.trim() === q.template.trim()) {
            feedbackEl.innerHTML = `<p style="color: var(--danger);">SYSTEM ERROR: NO MODIFICATIONS DETECTED.</p>`;
            feedbackEl.classList.remove('hidden');
            return;
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
            this.render();
        } catch (error) {
            console.error('Validation failed:', error);
            feedbackEl.innerHTML = `<p style="color: var(--danger);">CRITICAL ERROR: AI CORE DISCONNECTED.</p>`;
        }
    },

    async saveProgress(section, questionId, status, response, feedback = null) {
        try {
            await fetch('/api/progress', {
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

        try {
            const response = await fetch(`/api/questions/${this.category}/next`, {
                method: 'POST',
                headers: { ...Auth.getAuthHeader(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ type })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Failed to generate');
            }

            const newQuestion = await response.json();
            this.questions[this.section].push(newQuestion);
            this.currentIndex = this.questions[this.section].length - 1;
            this.render();
        } catch (error) {
            console.error('Failed to fetch next question:', error);
            App.notify('Error generating next question. Please try again.', 'error');
            this.render();
        }
    },

    jumpTo(index) {
        this.currentIndex = parseInt(index);
        this.render();
    }
};
