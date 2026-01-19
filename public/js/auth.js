const Auth = {
    token: localStorage.getItem('token'),
    empId: localStorage.getItem('empId'), // This remains as the username internally for consistency

    async login(email, password) {
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Login failed');
            }

            const { token, empId: loggedInEmpId } = await response.json();
            this.token = token;
            this.empId = loggedInEmpId;
            localStorage.setItem('token', token);
            localStorage.setItem('empId', loggedInEmpId);

            // --- GA4 EVENT: Login Success ---
            if (window.gtag) {
                gtag('event', 'login_success', {
                    method: 'email',
                    username: loggedInEmpId
                });
            }

            return true;
        } catch (error) {
            console.error('Login error:', error);
            App.notify(error.message, 'error');
            return false;
        }
    },

    async register(username, email, password, otp) {
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, otp })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Registration failed');
            }

            App.notify('Registration successful! Please login.', 'success');

            // --- GA4 EVENT: Registration Success ---
            if (window.gtag) {
                gtag('event', 'registration_success', {
                    username: username
                });
            }

            return true;
        } catch (error) {
            console.error('Registration error:', error);
            App.notify(error.message, 'error');
            return false;
        }
    },

    logout() {
        this.token = null;
        this.empId = null;
        localStorage.removeItem('token');
        localStorage.removeItem('empId');
        window.location.reload();
    },

    isAuthenticated() {
        return !!this.token;
    },

    getAuthHeader() {
        return { 'Authorization': `Bearer ${this.token}` };
    }
};
