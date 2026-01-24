const Admin = {
    token: localStorage.getItem('sigma_admin_token'),
    users: [],
    filteredUsers: [],
    stats: {},
    perfChart: null,
    distChart: null,

    init() {
        if (this.token) {
            this.showDashboard();
            this.loadStats();
            this.loadUsers();
            this.setupFilterListeners();
        } else {
            this.showLogin();
        }
    },

    setupFilterListeners() {
        const search = document.getElementById('admin-search');
        const sort = document.getElementById('admin-sort');

        if (search) search.addEventListener('input', () => this.handleSearchSort());
        if (sort) sort.addEventListener('change', () => this.handleSearchSort());
    },

    handleSearchSort() {
        const query = document.getElementById('admin-search').value.toLowerCase();
        const sortBy = document.getElementById('admin-sort').value;

        // Filter
        this.filteredUsers = this.users.filter(u =>
            u.username.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query)
        );

        // Sort
        this.filteredUsers.sort((a, b) => {
            if (sortBy === 'joined') return new Date(b.joined) - new Date(a.joined);
            return b[sortBy] - a[sortBy];
        });

        this.renderUserList();
    },

    async login() {
        const username = document.getElementById('admin-id').value;
        const password = document.getElementById('admin-pass').value;
        const errorEl = document.getElementById('login-error');

        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!res.ok) throw new Error('Authorization Rejected');

            const data = await res.json();
            this.token = data.token;
            localStorage.setItem('sigma_admin_token', this.token);
            this.showDashboard();
            this.loadStats();
            this.loadUsers();
        } catch (err) {
            errorEl.textContent = 'SECURITY_ALERT: ' + err.message;
        }
    },

    logout() {
        localStorage.removeItem('sigma_admin_token');
        location.reload();
    },

    showLogin() {
        document.getElementById('admin-login-overlay').classList.remove('hidden');
        document.getElementById('admin-dashboard').classList.add('hidden');
    },

    showDashboard() {
        document.getElementById('admin-login-overlay').classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');
    },

    async loadStats() {
        try {
            const res = await fetch('/api/admin/stats', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (res.status === 401 || res.status === 403) return this.logout();

            this.stats = await res.json();
            document.getElementById('stat-users').textContent = this.stats.users;
            document.getElementById('stat-interviews').textContent = this.stats.interviews;
            document.getElementById('stat-mcq').textContent = this.stats.mcq;
            document.getElementById('stat-practice').textContent = this.stats.practice;

            this.renderCharts();
        } catch (err) {
            console.error('Stats Error:', err);
        }
    },

    async loadUsers() {
        try {
            const res = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            this.users = await res.json();
            this.filteredUsers = [...this.users];
            this.handleSearchSort(); // Apply default sort
            this.renderCharts(); // Update distribution chart with user data
        } catch (err) {
            console.error('Users Error:', err);
        }
    },

    renderUserList() {
        const body = document.getElementById('user-list-body');
        body.innerHTML = this.filteredUsers.map(u => `
            <tr onclick="Admin.inspectUser('${u.username}')">
                <td style="color: var(--accent); font-weight: 700;">${u.username}</td>
                <td>${u.email}</td>
                <td style="text-transform: uppercase; font-size: 0.6rem;">
                    <span style="padding: 0.2rem 0.5rem; border: 1px solid ${u.plan === 'paid' ? 'var(--accent)' : '#444'}; color: ${u.plan === 'paid' ? 'var(--accent)' : '#888'}">${u.plan}</span>
                </td>
                <td>${u.mcq}</td>
                <td>${u.practice}</td>
                <td>${u.interviews}</td>
                <td style="color: var(--accent); font-weight: 900;">${u.score}</td>
                <td style="color: var(--text-secondary); opacity: 0.6;">${new Date(u.joined).toLocaleDateString()}</td>
                <td><button class="btn-inspect">INSPECT</button></td>
            </tr>
        `).join('');
    },

    async inspectUser(username) {
        try {
            const res = await fetch(`/api/admin/user/${username}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await res.json();
            this.showUserDetail(data);
        } catch (err) {
            console.error('Inspection Error:', err);
        }
    },

    showUserDetail(data) {
        const modal = document.getElementById('user-detail-modal');
        const content = document.getElementById('modal-content');
        const { user, progress, interviews } = data;

        content.innerHTML = `
            <h2 style="color: var(--accent); font-size: 2rem; margin-bottom: 0.5rem;">${user.username}</h2>
            <p style="font-family: var(--font-mono); color: var(--text-secondary); text-transform: uppercase;">${user.email} // TIER: ${user.plan} // CREDITS: ${user.interviewCredits}</p>
            
            <div style="margin-top: 3rem; display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                <div class="admin-table-container" style="padding: 1.5rem;">
                    <h3 style="color: var(--accent); margin-bottom: 1.5rem; font-size: 1rem;">MISSION HISTORY [${interviews.length}]</h3>
                    <table class="admin-table">
                        <thead>
                            <tr><th>Date</th><th>Type</th><th>Score</th></tr>
                        </thead>
                        <tbody>
                            ${interviews.map(i => `
                                <tr>
                                    <td>${new Date(i.createdAt).toLocaleDateString()}</td>
                                    <td>${i.type}</td>
                                    <td style="color: var(--accent); font-weight: 900;">${i.report?.score || 'N/A'}/10</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="admin-table-container" style="padding: 1.5rem;">
                    <h3 style="color: var(--accent); margin-bottom: 1.5rem; font-size: 1rem;">BADGE_INVENTORY</h3>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                        ${(user.badges || []).map(b => `
                            <div style="background: #111; border: 1px solid ${b.color}; padding: 0.5rem; border-radius: 4px; font-size: 0.6rem; color: ${b.color}; text-transform: uppercase;">
                                ${b.title}
                            </div>
                        `).join('') || '<p style="color: #444;">No Badges Earned</p>'}
                    </div>
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('user-detail-modal').classList.add('hidden');
    },

    renderCharts() {
        const perfCtx = document.getElementById('performanceChart').getContext('2d');
        const distCtx = document.getElementById('distributionChart').getContext('2d');

        if (this.perfChart) this.perfChart.destroy();
        if (this.distChart) this.distChart.destroy();

        // Performance Chart (Bar)
        this.perfChart = new Chart(perfCtx, {
            type: 'bar',
            data: {
                labels: ['Theory', 'Practice', 'Sessions'],
                datasets: [{
                    label: 'Global Activity',
                    data: [this.stats.mcq || 0, this.stats.practice || 0, this.stats.interviews || 0],
                    backgroundColor: ['#d4ff0033', '#00ffaa33', '#ff336633'],
                    borderColor: ['#d4ff00', '#00ffaa', '#ff3366'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: '#222' }, ticks: { color: '#888' } },
                    x: { grid: { display: false }, ticks: { color: '#888' } }
                },
                plugins: {
                    legend: { labels: { color: '#eee', font: { family: 'Inter' } } }
                }
            }
        });

        // Distribution Chart (Doughnut)
        this.distChart = new Chart(distCtx, {
            type: 'doughnut',
            data: {
                labels: ['Paid Tier', 'Free Tier'],
                datasets: [{
                    data: [
                        this.users.filter(u => u.plan === 'paid').length,
                        this.users.filter(u => u.plan === 'free').length
                    ],
                    backgroundColor: ['#d4ff00', '#222'],
                    borderColor: '#111',
                    borderWidth: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#eee' } }
                }
            }
        });
    }
};

Admin.init();
