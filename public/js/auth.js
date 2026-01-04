const Auth = {
    token: localStorage.getItem('token'),
    empId: localStorage.getItem('empId'),

    async login(empId, password) {
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ empId, password })
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
            return true;
        } catch (error) {
            console.error('Login error:', error);
            alert(error.message);
            return false;
        }
    },

    async register(empId, password) {
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ empId, password })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Registration failed');
            }

            alert('Registration successful! please login.');
            return true;
        } catch (error) {
            console.error('Registration error:', error);
            alert(error.message);
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
