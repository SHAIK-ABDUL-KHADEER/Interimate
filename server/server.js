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
const { User, Question, Progress, OTP, Interview } = require('./models');
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
            message: 'Email service is currently overtaxed. PROTOCOL BYPASS: Use code 123456 to register.',
            error: error.message
        });
    }
});

// 2. Register
app.post('/api/register', async (req, res) => {
    console.log('>>> [REG_INCOMING]', req.body.email, req.body.username);
    const { username, email, password, otp } = req.body;

    try {
        // Verify OTP (Master fallback: 123456)
        if (otp !== '123456') {
            const otpRecord = await OTP.findOne({ email, otp });
            if (!otpRecord) {
                console.warn('!!! [REG_OTP_FAIL]', email);
                return res.status(400).json({ message: 'Invalid or expired OTP' });
            }
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

// Admin Login Route
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '2457174') {
        const token = jwt.sign({ empId: 'admin', role: 'admin' }, SECRET_KEY, { expiresIn: '12h' });
        return res.json({ token });
    }
    res.status(401).json({ message: 'Invalid Admin Credentials' });
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
        // Verify OTP (Master fallback: 123456)
        if (otp !== '123456') {
            const otpRecord = await OTP.findOne({ email, otp });
            if (!otpRecord) {
                return res.status(400).json({ message: 'Invalid or expired OTP' });
            }
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
    const allowedCategories = ['java', 'selenium', 'sql'];

    if (!allowedCategories.includes(category)) {
        return res.status(404).json({ message: 'Category not found' });
    }

    console.log(`>>> [ROUTE_HIT] /api/questions/${category}`);

    try {
        let genesisBadges = null;
        const quizFile = `${category}_quiz.json`;
        const codeFile = `${category}_code.json`;

        let quizData = await readJSON(quizFile);
        let codeData = await readJSON(codeFile);

        console.log(`[API] Loaded from disk: Quiz(${Array.isArray(quizData) ? quizData.length : 0}), Code(${Array.isArray(codeData) ? codeData.length : 0})`);

        // Initialize as arrays if they are empty
        if (!Array.isArray(quizData)) quizData = [];
        if (!Array.isArray(codeData)) codeData = [];

        // If completely empty, generate the first ones
        if (quizData.length === 0) {
            console.log(`[API] Triggering Gemini for first Quiz: ${category}`);
            try {
                const firstQuiz = await generateQuestion(category, 'quiz', 0, quizData);
                quizData.push(firstQuiz);
                await writeJSON(quizFile, quizData);
                console.log(`[API] First Quiz generated and saved successfully.`);
                await checkAndGrantBadges(req.user.empId, true);
            } catch (err) {
                console.error(`[API] Gemini Quiz Generation Error:`, err.message);
            }
        }

        if (codeData.length === 0) {
            console.log(`[API] Triggering Gemini for first Code Challenge: ${category}`);
            try {
                const firstCode = await generateQuestion(category, 'code', 0, codeData);
                codeData.push(firstCode);
                await writeJSON(codeFile, codeData);
                console.log(`[API] First Code Challenge generated and saved successfully.`);
                // Trigger Badge Engine for genesis
                const b = await checkAndGrantBadges(req.user.empId, true);
                if (b && b.length > 0) genesisBadges = b;
            } catch (err) {
                console.error(`[API] Gemini Code Generation Error:`, err.message);
            }
        }

        if (quizData.length === 0 && codeData.length === 0) {
            console.error(`[FATAL] Empty tracks for ${category}. Check Gemini logs above.`);
            return res.status(503).json({
                message: 'AI_CORE_FAILURE_001: SYNTHESIS_REJECTED. The AI engine returned no data. Check terminal for Gemini errors.'
            });
        }

        res.json({
            mcq: quizData,
            practice: codeData,
            newBadges: genesisBadges
        });
    } catch (error) {
        console.error('[API] Unexpected Error:', error);
        res.status(500).json({ message: 'Internal server error while fetching modules.' });
    }
});

app.post('/api/questions/:category/next', authenticateToken, async (req, res) => {
    const { category } = req.params;
    const { type } = req.body; // 'quiz' or 'code'

    if (!['quiz', 'code'].includes(type)) {
        return res.status(400).json({ message: 'Invalid type' });
    }

    const limit = QUESTION_LIMITS[type];
    const fileName = `${category}_${type}.json`;

    try {
        let questions = await readJSON(fileName);
        if (!Array.isArray(questions)) questions = [];

        if (questions.length >= limit) {
            return res.status(400).json({ message: `Limit of ${limit} reached for ${category} ${type}` });
        }

        console.log(`Generating next ${type} for ${category} (Current: ${questions.length})`);
        const newQuestion = await generateQuestion(category, type, questions.length, questions);
        questions.push(newQuestion);
        await writeJSON(fileName, questions);

        // Trigger Badge Engine for genesis
        const newBadges = await checkAndGrantBadges(req.user.empId, true);

        res.json({ ...newQuestion, newBadges: newBadges.length > 0 ? newBadges : null });
    } catch (error) {
        console.error('Error generating next question:', error);
        res.status(500).json({ message: 'Error generating next question' });
    }
});

app.post('/api/validate', authenticateToken, async (req, res) => {
    const { category, title, description, userCode } = req.body;
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

// --- LEADERBOARD ROUTE ---

app.get('/api/leaderboard', authenticateToken, async (req, res) => {
    try {
        const allProgress = await Progress.find({});
        const leaderboard = [];

        for (const p of allProgress) {
            try {
                let totalCorrect = 0;
                let totalPractice = 0;
                const data = p.categories || {};

                ['java', 'selenium', 'sql'].forEach(cat => {
                    if (data[cat]) {
                        totalCorrect += Object.values(data[cat].mcq || {}).filter(q => q && q.status === 'correct').length;
                        totalPractice += Object.values(data[cat].practice || {}).filter(q => q && q.status === 'correct').length;
                    }
                });

                // Count completed interviews
                const interviewCount = await Interview.countDocuments({ username: p.username, status: 'completed' });

                leaderboard.push({
                    empId: p.username,
                    totalCorrect,
                    totalPractice,
                    totalInterviews: interviewCount,
                    score: totalCorrect + (totalPractice * 5) + (interviewCount * 10) // Bonus for participation
                });
            } catch (pErr) {
                console.warn(`[LEADERBOARD] Skipping record for ${p.username}:`, pErr.message);
            }
        }

        leaderboard.sort((a, b) => b.score - a.score);
        res.json(leaderboard.slice(0, 10));
    } catch (error) {
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
        const user = await User.findOne({ username: empId });
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Guard: Paid plan check for resume/role-resume
        if ((type === 'resume' || type === 'role-resume') && user.plan !== 'paid') {
            return res.status(403).json({ message: 'Professional evaluations are exclusive to paid users.' });
        }

        // Validate Role + Resume requirements
        if (type === 'role-resume' && (!targetRole || targetRole.trim().length < 3)) {
            return res.status(400).json({ message: 'Target Role is required for this protocol.' });
        }

        // Guard: Credits check
        if (user.interviewCredits <= 0) {
            return res.status(403).json({ message: 'No interview credits remaining. Please upgrade your plan.' });
        }

        // Guard: Daily limit check
        const today = new Date().setHours(0, 0, 0, 0);
        if (type === 'topic' && user.lastTopicInterview && new Date(user.lastTopicInterview).setHours(0, 0, 0, 0) === today) {
            return res.status(403).json({ message: 'Daily limit reached: Only 1 Topic Evaluation per day.' });
        }
        if (type === 'resume' && user.lastResumeInterview && new Date(user.lastResumeInterview).setHours(0, 0, 0, 0) === today) {
            return res.status(403).json({ message: 'Daily limit reached: Only 1 Resume Evaluation per day.' });
        }

        let resumeText = '';
        if (type === 'resume' && req.file) {
            const pdfData = await pdf(req.file.buffer);
            resumeText = pdfData.text;
        }

        const interview = new Interview({
            username: empId,
            type,
            topics: type === 'topic' ? JSON.parse(topics) : [],
            resumeText,
            targetRole: type === 'role-resume' ? targetRole : '',
            interviewerName: interviewerName || 'Agent Sigma',
            status: 'active'
        });

        const firstQuestion = await getNextInterviewQuestion(interview);
        interview.history.push({ question: firstQuestion.question, answer: null, feedback: firstQuestion.feedback });

        // Update user: deduct credit and set last attempt date
        user.interviewCredits -= 1;
        if (type === 'topic') user.lastTopicInterview = new Date();
        else user.lastResumeInterview = new Date();

        await Promise.all([interview.save(), user.save()]);

        res.json({
            interviewId: interview._id,
            nextQuestion: firstQuestion,
            remainingCredits: user.interviewCredits
        });
    } catch (error) {
        console.error('Interview Start Error:', error);
        res.status(500).json({ message: 'Failed to start interview.' });
    }
});

app.post('/api/interview/next', authenticateToken, async (req, res) => {
    const { interviewId, answer } = req.body;

    try {
        const interview = await Interview.findById(interviewId);
        if (!interview) return res.status(404).json({ message: 'Interview not found' });
        if (interview.status === 'completed') return res.status(400).json({ message: 'Interview already completed' });

        // Update the last question with the user's answer
        const lastEntry = interview.history[interview.history.length - 1];
        lastEntry.answer = answer;

        if (interview.history.length >= 10) {
            interview.status = 'completed';
            const report = await generateFinalReport(interview);
            interview.report = report;
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
        interview.history.push({ question: nextQuestion.question, answer: null, feedback: nextQuestion.feedback });
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

// --- ADMIN COMMAND ROUTES ---

app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        const [totalUsers, totalInterviews, totalProgress] = await Promise.all([
            User.countDocuments({}),
            Interview.countDocuments({ status: 'completed' }),
            Progress.find({})
        ]);

        let totalMCQ = 0;
        let totalPractice = 0;
        totalProgress.forEach(p => {
            Object.values(p.categories || {}).forEach(cat => {
                totalMCQ += Object.values(cat.mcq || {}).filter(q => q.status === 'correct').length;
                totalPractice += Object.values(cat.practice || {}).filter(q => q.status === 'correct').length;
            });
        });

        res.json({
            users: totalUsers,
            interviews: totalInterviews,
            mcq: totalMCQ,
            practice: totalPractice
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching admin stats' });
    }
});

app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const users = await User.find({}, '-password').sort({ createdAt: -1 });
        const progressData = await Progress.find({});
        const interviewData = await Interview.find({ status: 'completed' });

        const detailedUsers = users.map(u => {
            const p = progressData.find(prog => prog.username === u.username);
            const userInterviews = interviewData.filter(i => i.username === u.username);

            let mcq = 0, practice = 0;
            if (p) {
                Object.values(p.categories || {}).forEach(cat => {
                    mcq += Object.values(cat.mcq || {}).filter(q => q.status === 'correct').length;
                    practice += Object.values(cat.practice || {}).filter(q => q.status === 'correct').length;
                });
            }

            return {
                username: u.username,
                email: u.email,
                plan: u.plan,
                credits: u.interviewCredits,
                mcq,
                practice,
                interviews: userInterviews.length,
                joined: u.createdAt
            };
        });

        res.json(detailedUsers);
    } catch (err) {
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
            nextQuestion: {
                question: lastQuestion.question,
                feedback: lastQuestion.feedback,
                isCodeRequired: lastQuestion.question.includes('code') || lastQuestion.question.includes('Snippet') // Heuristic as it might not be saved
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

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder')
        .update(sign.toString())
        .digest("hex");

    if (razorpay_signature === expectedSign) {
        try {
            const user = await User.findOne({ username: empId });
            user.plan = 'paid';
            user.interviewCredits += 3; // Add 3 credits
            await user.save();

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
            res.status(500).json({ message: "Payment verified but failed to update credits" });
        }
    } else {
        res.status(400).json({ status: "failure", message: "Invalid signature" });
    }
});

// Ping endpoint for health checks
app.get('/api/ping', (req, res) => {
    res.status(200).send('ACK');
});

const serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`--- [READY] INTERIMATE SERVER ACTIVE ON PORT ${PORT} ---`);
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
