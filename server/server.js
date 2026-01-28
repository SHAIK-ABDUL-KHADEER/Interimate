const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { readJSON, writeJSON } = require('./db');
const { generateQuestion, validateCode } = require('./geminiService');
const fs = require('fs').promises;
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const { User, Question, Progress, OTP, Interview, Payment } = require('./models');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { getNextInterviewQuestion, generateFinalReport } = require('./interviewService');
const multer = require('multer');
const pdf = require('pdf-parse');
const Razorpay = require('razorpay');

// Razorpay Initialization
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder'
});

// AI Prompt Sanitization Utility
const sanitizeAIInput = (text, maxLength = 5000) => {
    if (!text || typeof text !== 'string') return "";
    return text
        .replace(/<[^>]*>/g, '') // Strip HTML tags
        .replace(/system:|user:|assistant:|ai:|instruction:|prompt:/gi, '[REDACTED]') // Block common prompt markers
        .trim()
        .substring(0, maxLength);
};

// Configure Multer for resume uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.doc', '.docx'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) cb(null, true);
        else cb(new Error('Invalid file type. Only PDF and DOCX supported.'));
    }
});

const app = express();
const PORT = process.env.PORT || 3005; // DYNAMIC PORT FOR RENDER
const SECRET_KEY = process.env.JWT_SECRET || 'interimate_secret_key';
const START_TIME = new Date().toISOString();

console.log('@@@ [SYSTEM_START] CORE_VERSION_3.0_SIGMA @@@');
console.log('ENV_PATH:', path.join(__dirname, '../.env'));
console.log('API_KEY_LOADED:', !!process.env.GEMINI_API_KEY);

console.log('--- INTERIMATE BOOT SEQUENCE ---');
console.log('PORT:', PORT);
console.log('MODEL:', process.env.GEMINI_MODEL);
console.log('KEY_DETECTED:', !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.startsWith('AIza'));
console.log('-------------------------------');

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log('--- [SUCCESS] MONGODB CONNECTED ---'))
        .catch(err => {
            console.error('--- [ERROR] MONGODB CONNECTION FAILED ---');
            console.error(err.message);
        });
} else {
    console.warn('--- [WARNING] MONGODB_URI NOT FOUND. FALLBACK TO EPOCH-LOCAL MODE ---');
}

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Rate Limiting Protocols
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: { message: "TOO_MANY_REQUESTS: Tactical pause required. Please wait 15 minutes." }
});

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 attempts
    message: { message: "AUTH_LOCKDOWN: Maximum attempts exceeded. Protocol restricted for 1 hour." }
});

app.use('/api/', apiLimiter);
// app.use('/api/login', authLimiter);
// app.use('/api/register', authLimiter);
// app.use('/api/admin/login', authLimiter);

// Diagnostic Middleware
app.use((req, res, next) => {
    res.setHeader('X-Core-Sigma', `CORE_VERSION_3.0_SIGMA_${START_TIME}`);
    next();
});

// Email Service - Brevo HTTP API Bridge (Zero-Port Restriction)
const sendEmail = async (to, subject, text) => {
    if (!process.env.BREVO_API_KEY) {
        throw new Error('CONFIG_ERROR: BREVO_API_KEY is missing from environment variables.');
    }
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            sender: { name: "Interimate Support", email: process.env.EMAIL_USER || "support@interimate.com" },
            to: [{ email: to }],
            subject: subject,
            textContent: text
        });

        const options = {
            hostname: 'api.brevo.com',
            path: '/v3/smtp/email',
            method: 'POST',
            headers: {
                'api-key': process.env.BREVO_API_KEY,
                'content-type': 'application/json',
                'accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let resData = '';
            res.on('data', (chunk) => resData += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(resData));
                } else {
                    reject(new Error(`Brevo API Error ${res.statusCode}: ${resData}`));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.write(data);
        req.end();
    });
};

// --- BADGE SYSTEM DEFINITIONS ---
const BADGE_DEFS = {
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
    'INT_10': { title: 'Field Specialist', description: 'Complete 10 AI Interview Sessions', stars: 3, color: '#ffb300' },
    'INT_20': { title: 'Tactical Master', description: 'Complete 20 AI Interview Sessions', stars: 4, color: '#ffcc00' },
    'ROLE_PIONEER': { title: 'Role Strategist', description: 'Complete your first Role + Resume Interview', stars: 3, color: '#d4ff00' },
    'PERFECT_10': { title: 'Sigma Ace', description: 'Achieve a perfect 10/10 in any AI Interview', stars: 5, color: '#00ffee' },
    'SCORE_90': { title: 'High Performer', description: 'Achieve a score of 90+ in any evaluation', stars: 3, color: '#00ff00' },
    'SCORE_95': { title: 'Elite Candidate', description: 'Achieve a score of 95+ in any evaluation', stars: 5, color: '#00ffee' }
};

async function checkAndGrantBadges(username, isGenesis = false) {
    try {
        const [user, progress, interviews] = await Promise.all([
            User.findOne({ username }),
            Progress.findOne({ username }),
            Interview.find({ username, status: 'completed' })
        ]);

        if (!user) return [];

        console.log(`[BADGE_ENGINE] Checking for ${username} (isGenesis: ${isGenesis})`);

        const earnedIds = user.badges.map(b => b.id);
        const newBadgesTriggered = [];

        // 0. Genesis Pioneer Check
        if (isGenesis && !earnedIds.includes('GENESIS_CREATOR')) {
            newBadgesTriggered.push('GENESIS_CREATOR');
        }

        // 1. Progress-dependent checks
        if (progress) {
            // Module Completion Checks
            for (const cat of ['java', 'selenium', 'sql']) {
                const data = progress.categories[cat] || {};
                const mcqSolved = Object.values(data.mcq || {}).filter(q => q.status === 'correct').length;
                const codeSolved = Object.values(data.practice || {}).filter(q => q.status === 'correct').length;
                const badgeId = `${cat.toUpperCase()}_EXPERT`;

                if (mcqSolved >= 100 && codeSolved >= 50 && !earnedIds.includes(badgeId)) {
                    newBadgesTriggered.push(badgeId);
                }
            }

            // 2. Global Totals Checks
            let totalMCQ = 0;
            let totalCode = 0;
            Object.values(progress.categories).forEach(cat => {
                totalMCQ += Object.values(cat.mcq || {}).filter(q => q.status === 'correct').length;
                totalCode += Object.values(cat.practice || {}).filter(q => q.status === 'correct').length;
            });

            const mcqMilestones = [50, 100, 300];
            mcqMilestones.forEach(m => {
                const bid = `QUIZ_${m}`;
                if (totalMCQ >= m && !earnedIds.includes(bid)) newBadgesTriggered.push(bid);
            });

            const codeMilestones = [50, 100, 150];
            codeMilestones.forEach(m => {
                const bid = `CODE_${m}`;
                if (totalCode >= m && !earnedIds.includes(bid)) newBadgesTriggered.push(bid);
            });
        }

        // 3. Interview Milestones
        const intCount = interviews.length;
        const intMilestones = [1, 5, 10, 20];
        intMilestones.forEach(m => {
            const bid = `INT_${m}`;
            if (intCount >= m && !earnedIds.includes(bid)) newBadgesTriggered.push(bid);
        });

        // Role Pioneer Check
        const roleIntCount = interviews.filter(i => i.type === 'role-resume').length;
        if (roleIntCount >= 1 && !earnedIds.includes('ROLE_PIONEER')) {
            newBadgesTriggered.push('ROLE_PIONEER');
        }

        // 4. High Score Checks
        const maxScore = interviews.length > 0 ? Math.max(...interviews.map(i => i.report ? i.report.score : 0)) : 0;
        if (maxScore >= 10 && !earnedIds.includes('PERFECT_10')) newBadgesTriggered.push('PERFECT_10');
        else if (maxScore >= 9.5 && !earnedIds.includes('SCORE_95')) newBadgesTriggered.push('SCORE_95');
        else if (maxScore >= 9 && !earnedIds.includes('SCORE_90')) newBadgesTriggered.push('SCORE_90');

        // 3. Save new badges if any
        if (newBadgesTriggered.length > 0) {
            const badgeObjects = newBadgesTriggered.map(bid => ({
                id: bid,
                ...BADGE_DEFS[bid],
                earnedAt: new Date().toISOString(),
                verificationId: `INT-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${username.substring(0, 3).toUpperCase()}`
            }));

            user.badges = [...user.badges, ...badgeObjects];
            await user.save();
            console.log(`+++ [BADGES_GRANTED] ${username} successfully secured badges:`, newBadgesTriggered);
            return badgeObjects;
        }
        console.log(`[BADGE_ENGINE] No new badges triggered for ${username}`);
    } catch (err) {
        console.error('[BADGE_ENGINE] Error:', err);
    }
    return [];
}

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ message: 'AUTHENTICATION_REQUIRED: No valid session token detected.' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            console.error('[AUTH_GUARD] Token Verification Failed:', err.message);
            return res.status(403).json({
                message: 'PROTOCOL_FORBIDDEN: Session invalid or expired. Please re-authenticate.',
                error: err.message
            });
        }
        req.user = user;
        next();
    });
};

const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'ADMIN_ACCESS_REQUIRED' });

    jwt.verify(token, SECRET_KEY, (err, data) => {
        if (err || data.role !== 'admin') {
            return res.status(403).json({ message: 'ADMIN_PROTOCOL_REJECTED' });
        }
        req.user = data;
        next();
    });
};

// --- AUTH ROUTES ---

// 1. Send OTP
app.post('/api/send-otp', async (req, res) => {
    const { email, username } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });
    if (!username) return res.status(400).json({ message: 'Username required' });

    try {
        // Pre-validation: Check if user already exists
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            const conflict = existingUser.email === email ? 'Email' : 'Username';
            return res.status(400).json({ message: `${conflict} already registered. Please login or use different credentials.` });
        }

        const otpCode = crypto.randomInt(100000, 999999).toString();
        await OTP.findOneAndUpdate({ email }, { otp: otpCode }, { upsert: true });

        const emailText = `Your OTP for account initialization is: ${otpCode}. This code expires in 10 minutes.`;

        // Retry logic for SendMail (API Mode)
        let attempts = 0;
        let sent = false;
        let lastError = null;

        while (attempts < 3 && !sent) {
            try {
                await sendEmail(email, 'Interimate Access Protocol - OTP Verification', emailText);
                sent = true;
            } catch (err) {
                attempts++;
                lastError = err;
                console.warn(`Email API Attempt ${attempts} failed:`, err.message);
                if (attempts < 3) await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (sent) {
            res.json({ message: 'OTP sent successfully to your email.' });
        } else {
            throw lastError;
        }
    } catch (error) {
        console.error('OTP Send Final Failure:', error);
        res.status(500).json({
            message: 'Email service failure. Please contact support if this persists.',
            error: error.message
        });
    }
});

// 2. Register
app.post('/api/register', async (req, res) => {
    console.log('>>> [REG_INCOMING]', req.body.email, req.body.username);
    const { username, email, password, otp } = req.body;

    try {
        // Verify OTP (Strict Enforcement)
        const otpRecord = await OTP.findOne({ email, otp });
        if (!otpRecord) {
            console.warn('!!! [REG_OTP_FAIL]', email);
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            console.warn('!!! [REG_CONFLICT]', username, email);
            return res.status(400).json({ message: 'Username or Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            isVerified: true,
            interviewCredits: 1
        });

        await newUser.save();
        console.log('+++ [REG_SUCCESS]', email);

        // Delete OTP after success
        await OTP.deleteOne({ email });

        res.status(201).json({ message: 'User registered successfully!' });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ message: 'Failed to register.' });
    }
});

// 3. Login
app.post('/api/login', async (req, res) => {
    console.log('>>> [LOGIN_INCOMING]', req.body.email);
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            console.warn('!!! [LOGIN_USER_NOT_FOUND]', email);
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const passMatch = await bcrypt.compare(password, user.password);
        if (!passMatch) {
            console.warn('!!! [LOGIN_PWD_MISMATCH]', email);
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (!user.isVerified) {
            console.warn('!!! [LOGIN_UNVERIFIED]', email);
            return res.status(403).json({ message: 'Please verify your email first.' });
        }

        console.log('+++ [LOGIN_SUCCESS]', email);
        const token = jwt.sign({ empId: user.username }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, empId: user.username });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Login failed.' });
    }
});

// Admin Login Route (Ghost Protocol Hardened)
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const ADMIN_U = process.env.ADMIN_USERNAME || 'admin_sigma';
    const ADMIN_P = process.env.ADMIN_PASSWORD || 'sigma_locked_2025';

    if (username === ADMIN_U && password === ADMIN_P) {
        const token = jwt.sign({ empId: 'admin', role: 'admin' }, SECRET_KEY, { expiresIn: '24h' });
        return res.json({ token });
    }
    res.status(401).json({ message: 'CREDENTIAL_REJECTED: Unauthorized Access Attempt logged.' });
});

// Serve Admin Panel (Ghost Protocol)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// 4. Forgot Password - Send OTP
app.post('/api/forgot-password-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'No account found with this email.' });
        }

        const otpCode = crypto.randomInt(100000, 999999).toString();
        await OTP.findOneAndUpdate({ email }, { otp: otpCode }, { upsert: true });

        const emailText = `Your password reset code is: ${otpCode}. This code expires in 10 minutes. If you did not request this, please ignore this email.`;

        try {
            await sendEmail(email, 'Interimate - Password Reset OTP', emailText);
            res.json({ message: 'Reset OTP sent to your email.' });
        } catch (err) {
            console.error('Forgot Pwd OTP Error:', err);
            res.status(500).json({ message: 'Failed to send reset email. Please try again later.' });
        }
    } catch (error) {
        console.error('Forgot Pass Error:', error);
        res.status(500).json({ message: 'Server error during reset request.' });
    }
});

// 5. Reset Password
app.post('/api/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
        return res.status(400).json({ message: 'Email, OTP, and new password are required' });
    }

    try {
        // Verify OTP (Strict Enforcement)
        const otpRecord = await OTP.findOne({ email, otp });
        if (!otpRecord) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const result = await User.updateOne({ email }, { password: hashedPassword });

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Delete OTP after success
        await OTP.deleteOne({ email });

        console.log('+++ [PWD_RESET_SUCCESS]', email);
        res.json({ message: 'Password reset successfully. You can now login.' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ message: 'Failed to reset password.' });
    }
});

// 6. Feedback
app.post('/api/feedback', authenticateToken, async (req, res) => {
    const { feedback } = req.body;
    const user = req.user; // From authenticateToken middleware (contains empId)

    if (!feedback) return res.status(400).json({ message: 'Feedback content required' });

    try {
        // Fetch user's email from DB
        const userData = await User.findOne({ username: user.empId });
        if (!userData || !userData.email) {
            throw new Error('User email not found for auto-reply.');
        }

        const supportEmailText = `New Feedback from ${user.empId} (${userData.email}):\n\n${feedback}`;
        const userAutoReplyText = `Received your feedback.\n\nThanks for your feedback.\nWe will definitely work on it for sure.\n\nIf there are any issues please mail us at support@interimate.com`;

        // Parallel execution for speed
        await Promise.all([
            sendEmail('support@interimate.com', `Interimate Feedback - ${user.empId}`, supportEmailText),
            sendEmail(userData.email, 'We received your feedback - Interimate', userAutoReplyText)
        ]);

        res.json({ message: 'Feedback sent successfully! Thank you for the contribution.' });
    } catch (error) {
        console.error('Feedback Error:', error);
        res.status(500).json({ message: 'Failed to send feedback. Please try again later.' });
    }
});

// --- QUESTION ROUTES ---

const QUESTION_LIMITS = { quiz: 100, code: 50 };

app.get('/api/questions/:category', authenticateToken, async (req, res) => {
    const { category } = req.params;
    const allowedCategories = ['java', 'selenium', 'sql', 'functional', 'poi', 'testng'];

    if (!allowedCategories.includes(category)) {
        return res.status(404).json({ message: 'Category not found' });
    }

    try {
        let genesisBadges = null;

        // Fetch from DB
        let quizData = await Question.find({ category, type: 'quiz' }).sort({ id: 1 });
        let codeData = await Question.find({ category, type: 'code' }).sort({ id: 1 });

        // Extract raw data from objects for the frontend
        let mcqs = quizData.map(q => q.data);
        let practice = codeData.map(q => q.data);

        // If completely empty, generate the first ones
        if (mcqs.length === 0) {
            console.log(`[DB] Triggering Gemini for first Quiz: ${category}`);
            try {
                const firstQuiz = await generateQuestion(category, 'quiz', 0, []);
                const saved = await Question.create({ category, type: 'quiz', id: 1, data: firstQuiz });
                mcqs.push(saved.data);
                await checkAndGrantBadges(req.user.empId, true);
            } catch (err) {
                console.error(`[DB] Gemini Quiz Generation Error:`, err.message);
            }
        }

        if (practice.length === 0) {
            console.log(`[DB] Triggering Gemini for first Code Challenge: ${category}`);
            try {
                const firstCode = await generateQuestion(category, 'code', 0, []);
                const saved = await Question.create({ category, type: 'code', id: 1, data: firstCode });
                practice.push(saved.data);
                const b = await checkAndGrantBadges(req.user.empId, true);
                if (b && b.length > 0) genesisBadges = b;
            } catch (err) {
                console.error(`[DB] Gemini Code Generation Error:`, err.message);
            }
        }

        res.json({
            mcq: mcqs,
            practice: practice,
            newBadges: genesisBadges
        });
    } catch (error) {
        console.error('[DB] Fetch Error:', error);
        res.status(500).json({ message: 'Internal server error while fetching modules.' });
    }
});

app.post('/api/questions/:category/next', authenticateToken, async (req, res) => {
    const { category } = req.params;
    const { type } = req.body; // 'quiz' or 'code'

    if (!['quiz', 'code'].includes(type) || !['java', 'selenium', 'sql', 'functional', 'poi', 'testng'].includes(category)) {
        return res.status(400).json({ message: 'Invalid protocol parameters' });
    }

    const limit = (category === 'poi' || category === 'testng') ? (category === 'poi' ? 25 : 50) : QUESTION_LIMITS[type];

    try {
        const existingDB = await Question.find({ category, type }).sort({ id: 1 });
        const existingData = existingDB.map(q => q.data);

        if (existingData.length >= limit) {
            return res.status(400).json({ message: `Limit of ${limit} reached for ${category} ${type}` });
        }

        console.log(`Generating next ${type} for ${category} (Current: ${existingData.length})`);
        const newQuestionJSON = await generateQuestion(category, type === 'quiz' ? 'quiz' : 'code', existingData.length, existingData);

        const saved = await Question.create({
            category,
            type,
            id: existingData.length + 1,
            data: newQuestionJSON
        });

        // Trigger Badge Engine for genesis
        const newBadges = await checkAndGrantBadges(req.user.empId, true);

        res.json({ ...saved.data, newBadges: newBadges.length > 0 ? newBadges : null });
    } catch (error) {
        console.error('[DB] Generation Error:', error);
        res.status(500).json({ message: 'Error generating next question' });
    }
});

app.post('/api/validate', authenticateToken, async (req, res) => {
    let { category, title, description, userCode } = req.body;
    userCode = sanitizeAIInput(userCode, 10000); // Code can be longer

    console.log(`[API] Validating code for: ${title}`);

    try {
        const result = await validateCode(category, title, description, userCode);
        res.json(result);
    } catch (error) {
        console.error('[API] Validation Error:', error);
        res.status(500).json({ isCorrect: false, feedback: "Internal server error during validation." });
    }
});

// --- PROGRESS ROUTES ---

app.get('/api/progress', authenticateToken, async (req, res) => {
    try {
        const empId = req.user.empId;
        const [user, progress] = await Promise.all([
            User.findOne({ username: empId }),
            Progress.findOne({ username: empId })
        ]);

        res.json({
            ...(progress ? progress.categories : {}),
            plan: user?.plan || 'free',
            interviewCredits: user?.interviewCredits || 0,
            badges: user?.badges || []
        });
    } catch (error) {
        console.error('Progress Fetch Error:', error);
        res.status(500).json({ message: 'Error fetching progress data' });
    }
});

// --- LEADERBOARD ROUTE & CACHING ---
let leaderboardCache = null;
let lastLeaderboardUpdate = 0;
const LEADERBOARD_CACHE_TTL = 10 * 1000; // 10 Seconds for near real-time sync

app.get('/api/leaderboard', authenticateToken, async (req, res) => {
    try {
        if (leaderboardCache && (Date.now() - lastLeaderboardUpdate < LEADERBOARD_CACHE_TTL)) {
            return res.json(leaderboardCache);
        }

        const leaderboard = await Progress.aggregate([
            {
                $project: {
                    username: 1,
                    categoriesArr: { $objectToArray: "$categories" }
                }
            },
            { $unwind: "$categoriesArr" },
            {
                $project: {
                    username: 1,
                    mcqArr: { $objectToArray: "$categoriesArr.v.mcq" },
                    practiceArr: { $objectToArray: "$categoriesArr.v.practice" }
                }
            },
            {
                $project: {
                    username: 1,
                    correctMCQs: {
                        $filter: {
                            input: { $ifNull: ["$mcqArr", []] },
                            as: "item",
                            cond: { $eq: ["$$item.v.status", "correct"] }
                        }
                    },
                    correctPractice: {
                        $filter: {
                            input: { $ifNull: ["$practiceArr", []] },
                            as: "item",
                            cond: { $eq: ["$$item.v.status", "correct"] }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$username",
                    totalCorrect: { $sum: { $size: "$correctMCQs" } },
                    totalPractice: { $sum: { $size: "$correctPractice" } }
                }
            },
            {
                $lookup: {
                    from: "interviews",
                    let: { name: "$_id" },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ["$username", "$$name"] }, { $eq: ["$status", "completed"] }] } } },
                        { $count: "count" }
                    ],
                    as: "interviewData"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "username",
                    as: "userInfo"
                }
            },
            {
                $project: {
                    empId: "$_id",
                    totalCorrect: 1,
                    totalPractice: 1,
                    totalInterviews: { $ifNull: [{ $arrayElemAt: ["$interviewData.count", 0] }, 0] },
                    badgeCount: { $size: { $ifNull: [{ $arrayElemAt: ["$userInfo.badges", 0] }, []] } },
                    score: {
                        $add: [
                            "$totalCorrect",
                            { $multiply: ["$totalPractice", 5] },
                            { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$interviewData.count", 0] }, 0] }, 10] }
                        ]
                    }
                }
            },
            { $sort: { score: -1, totalPractice: -1, totalCorrect: -1 } },
            { $limit: 100 }
        ]);

        leaderboardCache = leaderboard;
        lastLeaderboardUpdate = Date.now();

        res.json(leaderboard);
    } catch (error) {
        console.error('[LEADERBOARD_AGG] Error:', error);
        res.status(500).json({ message: 'Error fetching leaderboard' });
    }
});

app.post('/api/progress', authenticateToken, async (req, res) => {
    const { category, section, questionId, status, response, feedback } = req.body;
    const username = req.user.empId;

    try {
        let p = await Progress.findOne({ username });
        if (!p) {
            p = new Progress({ username, categories: {} });
        }

        if (!p.categories[category]) {
            p.categories[category] = { mcq: {}, practice: {}, lastVisited: {} };
        } else {
            // Ensure deep objects exist for migration/legacy cases
            if (!p.categories[category].mcq) p.categories[category].mcq = {};
            if (!p.categories[category].practice) p.categories[category].practice = {};
            if (!p.categories[category].lastVisited) p.categories[category].lastVisited = {};
        }

        // We need to mark Modified for deep objects in Mongoose
        p.markModified('categories');

        if (section === 'mcq') {
            p.categories[category].mcq[questionId] = { status, response, timestamp: new Date().toISOString() };
            p.categories[category].lastVisited.mcq = questionId;
        } else if (section === 'practice') {
            p.categories[category].practice[questionId] = { status, response, feedback, timestamp: new Date().toISOString() };
            p.categories[category].lastVisited.practice = questionId;
        }

        // 6. Progress Management (rest)
        await p.save();

        // Trigger Badge Engine
        const newBadges = await checkAndGrantBadges(username);

        res.json({
            message: 'Progress updated',
            newBadges: newBadges.length > 0 ? newBadges : null
        });
    } catch (error) {
        console.error('Progress Update Error:', error);
        res.status(500).json({ message: 'Failed to update progress' });
    }
});

app.get('/api/user/badges', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.user.empId });
        res.json(user.badges || []);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch badges' });
    }
});

// 6.5 Diagnostic Endpoint
app.get('/api/diag', (req, res) => {
    res.json({
        time: new Date().toISOString(),
        model: process.env.GEMINI_MODEL || 'N/A',
        key_exists: !!process.env.GEMINI_API_KEY,
        db_status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        node_version: process.version,
        uptime: process.uptime()
    });
});

// 7. Interview Engine
app.post('/api/interview/start', authenticateToken, upload.single('resume'), async (req, res) => {
    const { type, topics, interviewerName, targetRole } = req.body;
    const empId = req.user.empId;

    try {
        // BYPASS: Everything is free for now.
        const user = await User.findOne({ username: empId });

        if (!user) {
            return res.status(404).json({ message: 'PROTOCOL_ERROR: User identity not found.' });
        }

        /* 
        // Original Credit/Plan Logic (Preserved for future restoration)
        const userWithCredits = await User.findOneAndUpdate(
            { username: empId, interviewCredits: { $gt: 0 } },
            { $inc: { interviewCredits: -1 } },
            { new: true }
        );
        */

        // BYPASS: Paid plan check for resume/role-resume (Disabled)
        /*
        if ((type === 'resume' || type === 'role-resume') && user.plan !== 'paid') {
            await User.updateOne({ username: empId }, { $inc: { interviewCredits: 1 } });
            return res.status(403).json({ message: 'UNAUTHORIZED: Professional evaluations require Premium Tier.' });
        }
        */

        // Validate Role + Resume requirements
        if (type === 'role-resume' && (!targetRole || targetRole.trim().length < 3)) {
            // No credit refund needed as we aren't deducting
            return res.status(400).json({ message: 'VALIDATION_FAILURE: Target Role is required for this protocol.' });
        }

        // BYPASS: Daily limit check (Disabled)
        /*
        const today = new Date().setHours(0, 0, 0, 0);
        if (type === 'topic' && user.lastTopicInterview && new Date(user.lastTopicInterview).setHours(0, 0, 0, 0) === today) {
            await User.updateOne({ username: empId }, { $inc: { interviewCredits: 1 } });
            return res.status(403).json({ message: 'LIMIT_EXCEEDED: Daily Topic Evaluation limit reached.' });
        }
        if (type === 'resume' && user.lastResumeInterview && new Date(user.lastResumeInterview).setHours(0, 0, 0, 0) === today) {
            await User.updateOne({ username: empId }, { $inc: { interviewCredits: 1 } });
            return res.status(403).json({ message: 'LIMIT_EXCEEDED: Daily Resume Evaluation limit reached.' });
        }
        */

        let resumeText = '';
        if ((type === 'resume' || type === 'role-resume') && req.file) {
            try {
                const pdfData = await pdf(req.file.buffer);
                resumeText = pdfData.text;
            } catch (pErr) {
                // No credit refund needed
                return res.status(400).json({ message: 'PDF_PARSE_ERROR: Failed to analyze resume content.' });
            }
        }

        const topicsArray = type === 'topic' ? JSON.parse(topics) : [];
        let totalQuestions = 10; // Default for non-topic based
        if (type === 'topic') {
            const n = topicsArray.length;
            totalQuestions = 15; // Floor for 1-3 topics
            if (n === 4) totalQuestions = 20;
            else if (n === 5) totalQuestions = 25;
            else if (n >= 6) totalQuestions = 30;
        }

        const interview = new Interview({
            username: empId,
            type,
            topics: topicsArray,
            resumeText,
            targetRole: type === 'role-resume' ? sanitizeAIInput(targetRole, 100) : '',
            interviewerName: sanitizeAIInput(interviewerName, 100) || 'Agent Sigma',
            totalQuestions,
            status: 'active'
        });

        // Escalated prompt generation
        let firstQuestion;
        try {
            firstQuestion = await getNextInterviewQuestion(interview);
        } catch (aiErr) {
            console.error('[AI_SERVICE_CRASH]', aiErr);
            await User.updateOne({ username: empId }, { $inc: { interviewCredits: 1 } });
            return res.status(503).json({ message: 'AI_ORCHESTRATION_FAILURE: The Gemini Engine is currently overloaded.' });
        }

        interview.history.push({
            question: firstQuestion.question,
            answer: null,
            feedback: firstQuestion.feedback,
            isCodeRequired: firstQuestion.isCodeRequired || false
        });

        // Update last attempt date
        if (type === 'topic') user.lastTopicInterview = new Date();
        else user.lastResumeInterview = new Date();

        await Promise.all([interview.save(), user.save()]);

        res.json({
            status: 'active',
            interviewId: interview._id,
            totalQuestions: interview.totalQuestions,
            nextQuestion: firstQuestion,
            remainingCredits: user.interviewCredits
        });
    } catch (error) {
        console.error('Interview Start Error:', error);
        res.status(500).json({ message: 'Failed to start interview protocol.' });
    }
});

app.post('/api/interview/next', authenticateToken, async (req, res) => {
    let { interviewId, answer } = req.body;
    answer = sanitizeAIInput(answer);

    try {
        const interview = await Interview.findById(interviewId);
        if (!interview) return res.status(404).json({ message: 'Interview not found' });
        if (interview.status === 'completed') return res.status(400).json({ message: 'Interview already completed' });

        // Update the last question with the user's answer (Secured Update)
        const lastIndex = interview.history.length - 1;
        if (lastIndex >= 0) {
            interview.history[lastIndex].answer = answer;
            interview.markModified(`history.${lastIndex}.answer`);
        }

        // INTERMEDIATE SAVE: Secure the user's answer before starting long-running AI work
        await interview.save();

        // TERMINATION CHECK: If history size equals totalQuestions, we are done.
        if (interview.history.length >= interview.totalQuestions) {
            interview.status = 'completed';

            // Pass the LATEST interview object to report generation
            const report = await generateFinalReport(interview);
            interview.report = report;

            // Final save for report and completion status
            interview.markModified('report');
            await interview.save();

            // Trigger Badge Engine
            const newBadges = await checkAndGrantBadges(interview.username);

            return res.json({
                status: 'completed',
                report,
                newBadges: newBadges.length > 0 ? newBadges : null
            });
        }

        const nextQuestion = await getNextInterviewQuestion(interview);
        interview.history.push({
            question: nextQuestion.question,
            answer: null,
            feedback: nextQuestion.feedback,
            isCodeRequired: nextQuestion.isCodeRequired || false
        });

        // Ensure Mongoose detects the nested history update
        interview.markModified('history');
        await interview.save();

        res.json({ status: 'active', nextQuestion });
    } catch (error) {
        console.error('Interview Next Error:', error);
        res.status(500).json({ message: 'Failed to process answer.' });
    }
});

app.get('/api/interview/report/:id', authenticateToken, async (req, res) => {
    try {
        const interview = await Interview.findById(req.params.id);
        if (!interview || !interview.report) {
            return res.status(404).json({ message: 'Report not ready or missing' });
        }
        res.json(interview);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching report' });
    }
});

app.get('/api/interviews/list', authenticateToken, async (req, res) => {
    try {
        const interviews = await Interview.find({ username: req.user.empId }).sort({ createdAt: -1 });
        res.json(interviews);
    } catch (error) {
        console.error('Fetch Interviews Error:', error);
        res.status(500).json({ message: 'Failed to fetch interview history' });
    }
});

// --- ADMIN COMMAND ROUTES ---

app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        const [userCount, interviewCount, progressStats] = await Promise.all([
            User.countDocuments({}),
            Interview.countDocuments({ status: 'completed' }),
            Progress.aggregate([
                { $project: { categoriesArr: { $objectToArray: "$categories" } } },
                { $unwind: { path: "$categoriesArr", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        mcqArr: { $objectToArray: { $ifNull: ["$categoriesArr.v.mcq", {}] } },
                        practiceArr: { $objectToArray: { $ifNull: ["$categoriesArr.v.practice", {}] } }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalMCQ: {
                            $sum: {
                                $size: {
                                    $filter: {
                                        input: { $ifNull: ["$mcqArr", []] },
                                        as: "q",
                                        cond: { $eq: ["$$q.v.status", "correct"] }
                                    }
                                }
                            }
                        },
                        totalPractice: {
                            $sum: {
                                $size: {
                                    $filter: {
                                        input: { $ifNull: ["$practiceArr", []] },
                                        as: "q",
                                        cond: { $eq: ["$$q.v.status", "correct"] }
                                    }
                                }
                            }
                        }
                    }
                }
            ])
        ]);

        const stats = progressStats[0] || { totalMCQ: 0, totalPractice: 0 };

        res.json({
            users: userCount,
            interviews: interviewCount,
            mcq: stats.totalMCQ,
            practice: stats.totalPractice
        });
    } catch (err) {
        console.error('[ADMIN_STATS] Error:', err);
        res.status(500).json({ message: 'Error fetching admin stats' });
    }
});

app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const users = await User.aggregate([
            { $sort: { createdAt: -1 } },
            {
                $lookup: {
                    from: "progresses",
                    localField: "username",
                    foreignField: "username",
                    as: "progressInfo"
                }
            },
            {
                $lookup: {
                    from: "interviews",
                    let: { name: "$username" },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ["$username", "$$name"] }, { $eq: ["$status", "completed"] }] } } },
                        { $count: "count" }
                    ],
                    as: "interviewData"
                }
            },
            {
                $project: {
                    username: 1,
                    email: 1,
                    plan: 1,
                    badges: 1,
                    joined: "$createdAt",
                    credits: "$interviewCredits",
                    interviews: { $ifNull: [{ $arrayElemAt: ["$interviewData.count", 0] }, 0] },
                    progress: { $arrayElemAt: ["$progressInfo.categories", 0] }
                }
            }
        ]);

        // We still need a bit of post-processing if categories aggregation is too complex in a single pipeline
        // But let's try to do it in the pipeline for true performance
        const detailedUsers = users.map(u => {
            let mcq = 0, practice = 0;
            if (u.progress) {
                Object.values(u.progress).forEach(cat => {
                    mcq += Object.values(cat.mcq || {}).filter(q => q.status === 'correct').length;
                    practice += Object.values(cat.practice || {}).filter(q => q.status === 'correct').length;
                });
            }
            return {
                username: u.username,
                email: u.email,
                plan: u.plan,
                credits: u.credits,
                mcq,
                practice,
                interviews: u.interviews,
                badgeCount: (u.badges || []).length,
                score: mcq + (practice * 5) + (u.interviews * 10),
                joined: u.joined
            };
        });

        res.json(detailedUsers);
    } catch (err) {
        console.error('[ADMIN_USERS] Error:', err);
        res.status(500).json({ message: 'Error fetching user list' });
    }
});

app.get('/api/admin/user/:username', authenticateAdmin, async (req, res) => {
    try {
        const [user, progress, interviews] = await Promise.all([
            User.findOne({ username: req.params.username }, '-password'),
            Progress.findOne({ username: req.params.username }),
            Interview.find({ username: req.params.username }).sort({ createdAt: -1 })
        ]);

        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({ user, progress, interviews });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching user details' });
    }
});

// Resume an active interview
app.get('/api/interview/resume/:id', authenticateToken, async (req, res) => {
    try {
        const interview = await Interview.findById(req.params.id);
        if (!interview) return res.status(404).json({ message: 'Interview not found' });
        if (interview.status === 'completed') return res.status(400).json({ message: 'Interview already completed' });

        // Return the last state
        const lastQuestion = interview.history[interview.history.length - 1];
        res.json({
            interviewId: interview._id,
            questionCount: interview.history.length,
            totalQuestions: interview.totalQuestions,
            nextQuestion: {
                question: lastQuestion.question,
                feedback: lastQuestion.feedback,
                isCodeRequired: lastQuestion.isCodeRequired || false
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error resuming interview' });
    }
});

// 8. Payment & Coupons
app.get('/api/config/razorpay-key', (req, res) => {
    res.json({ keyId: process.env.RAZORPAY_KEY_ID || '' });
});

app.post('/api/coupon/validate', authenticateToken, (req, res) => {
    const { code } = req.body;
    if (code?.toLowerCase() === 'poornima') {
        return res.json({ valid: true, original: 99, discounted: 9 });
    }
    if (code?.toLowerCase() === 'cognizant') {
        return res.json({ valid: true, original: 99, discounted: 1 });
    }
    res.status(400).json({ valid: false, message: 'Invalid coupon code' });
});

app.post('/api/payment/order', authenticateToken, async (req, res) => {
    const { amount, couponCode } = req.body;

    // Server-side validation of price
    let finalAmount = 99;
    if (couponCode?.toLowerCase() === 'poornima') finalAmount = 9;
    if (couponCode?.toLowerCase() === 'cognizant') finalAmount = 1;

    const options = {
        amount: finalAmount * 100, // amount in paisa
        currency: "INR",
        receipt: `receipt_${Date.now()}`
    };

    try {
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error('Razorpay Order Error:', error);
        res.status(500).json({ message: 'Failed to create payment order' });
    }
});

app.post('/api/payment/verify', authenticateToken, async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const empId = req.user.empId;

    // Check for replay attack
    const existingPayment = await Payment.findOne({ paymentId: razorpay_payment_id });
    if (existingPayment) {
        return res.status(400).json({ status: "failure", message: "PROTOCOL_VIOLATION: Payment already processed." });
    }

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || 'FORCED_FAILURE_IF_MISSING')
        .update(sign.toString())
        .digest("hex");

    if (razorpay_signature === expectedSign) {
        try {
            // Atomic update to prevent race conditions on credits
            const user = await User.findOneAndUpdate(
                { username: empId },
                {
                    $set: { plan: 'paid' },
                    $inc: { interviewCredits: 3 }
                },
                { new: true }
            );

            // Log successful payment
            await Payment.create({
                paymentId: razorpay_payment_id,
                orderId: razorpay_order_id,
                username: empId
            });

            // Send Acknowledgment Email
            try {
                const emailSubject = "MISSION_ACQUISITION: Premium Tier Activated";
                const emailText = `Hello ${user.username || 'Operative'},\n\nYour transaction has been verified. The Sigma Engine has been upgraded to the Professional Tier.\n\nACQUISITIONS:\n- 3 Full Interview Credits Added\n- Resume-Based Evaluation Unlocked\n- Advanced Daily Protocol Limits Applied\n\nLogin to Interimate to begin your elevation.\n\nRegards,\nAgent Sigma\nInterimate Prep Solutions`;
                await sendEmail(user.email, emailSubject, emailText);
            } catch (mailErr) {
                console.error('Failed to send payment ack email:', mailErr);
            }

            res.json({ status: "success", message: "Payment verified, 3 credits added!" });
        } catch (err) {
            console.error('[PAYMENT_VERIFY] Error:', err);
            res.status(500).json({ message: "Payment verified but system failed to update records. Contact support." });
        }
    } else {
        res.status(400).json({ status: "failure", message: "Invalid signature" });
    }
});

// Ping endpoint for health checks
app.get('/api/ping', (req, res) => {
    res.status(200).send('ACK');
});

// 9. Telemetry & Errors
app.post('/api/telemetry/error', (req, res) => {
    const { error, stack, url } = req.body;
    console.error(`[CLIENT_ERROR] URL: ${url} | ERR: ${error}`);
    if (stack) console.error(stack);
    res.status(204).send();
});

// Centralized SPA Routing for Clean URLs
app.get([
    '/contact-us', '/terms-conditions', '/cancellations-refunds', '/privacy-policy',
    '/dashboard', '/interviews', '/pricing', '/feedback', '/leaderboard', '/badges', '/selection', '/quiz'
], (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Centralized Error Handler (Ghost Protocol)
app.use((err, req, res, next) => {
    console.error(' [!] CRITICAL_UNHANDLED_EXCEPTION:');
    console.error(' [!] Route:', req.originalUrl);
    console.error(' [!] Stack:', err.stack);

    res.status(err.status || 500).json({
        message: 'SYSTEM_ERROR: The Sigma Engine encountered an internal exception. Operational logs have been updated.',
        protocol: 'SIGMA_EXCEPTION_HANDLED'
    });
});

const serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`### [CORE_ONLINE] SIGMA V3.0 LISTENING ON PORT ${PORT} ###`);
    console.log(`--- [SIG] CORE_VERSION_3.0_SIGMA ---`);

    // Survival Heartbeat
    setInterval(() => {
        console.log(`[HEARTBEAT] ${new Date().toISOString()} // Process: ${process.pid} // Active`);
    }, 30000);
});

serverInstance.on('error', (err) => {
    console.error('@@@ [FATAL_BOOT_ERROR] @@@');
    console.error(err);
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is BUSY. Please kill the ghost process first.`);
    }
    process.exit(1);
});

// SELF-PING KEEP ALIVE (prevents Render from sleeping)
const EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
if (EXTERNAL_URL) {
    console.log(`[KEEP-ALIVE] Initializing for: ${EXTERNAL_URL}`);
    setInterval(() => {
        https.get(`${EXTERNAL_URL}/api/ping`, (res) => {
            console.log(`[KEEP-ALIVE] Ping sent: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error('[KEEP-ALIVE] Ping error:', err.message);
        });
    }, 14 * 60 * 1000); // 14 mins
}

// Global UNHANDLED REJECTION handler
process.on('unhandledRejection', (reason, promise) => {
    console.error('@@@ UNHANDLED_REJECTION @@@');
    console.error('Reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('@@@ UNCAUGHT_EXCEPTION @@@');
    console.error(err);
});
