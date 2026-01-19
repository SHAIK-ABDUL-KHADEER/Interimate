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
const { User, Question, Progress, OTP } = require('./models');
const crypto = require('crypto');

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

// Nodemailer Transporter - Hostinger Professional SMTP
const transporter = nodemailer.createTransport({
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true, // Use SSL for Port 465
    pool: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    debug: true,
    logger: true
});

// Verify Email Connection on Startup
transporter.verify((error, success) => {
    if (error) {
        console.error('--- [WARNING] EMAIL_BRIDGE_STANDBY ---');
        console.log('Reason:', error.message);
    } else {
        console.log('--- [READY] INTERNAL_EMAIL_BRIDGE_ACTIVE ---');
    }
});

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- AUTH ROUTES ---

// 1. Send OTP
app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });

    try {
        const otpCode = crypto.randomInt(100000, 999999).toString();
        await OTP.findOneAndUpdate({ email }, { otp: otpCode }, { upsert: true });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Interimate Access Protocol - OTP Verification',
            text: `Your OTP for account initialization is: ${otpCode}. This code expires in 10 minutes.`
        };

        // Retry logic for SendMail
        let attempts = 0;
        let sent = false;
        let lastError = null;

        while (attempts < 3 && !sent) {
            try {
                await transporter.sendMail(mailOptions);
                sent = true;
            } catch (err) {
                attempts++;
                lastError = err;
                console.warn(`SMTP Attempt ${attempts} failed:`, err.message);
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
    console.log('Register request received:', req.body);
    const { username, email, password, otp } = req.body;

    try {
        // Verify OTP (Master fallback: 123456)
        if (otp !== '123456') {
            const otpRecord = await OTP.findOne({ email, otp });
            if (!otpRecord) {
                return res.status(400).json({ message: 'Invalid or expired OTP' });
            }
        }

        // Check if user exists
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(400).json({ message: 'Username or Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            isVerified: true
        });

        await newUser.save();

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
    console.log('Login request received:', req.body);
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (!user.isVerified) {
            return res.status(403).json({ message: 'Please verify your email first.' });
        }

        const token = jwt.sign({ empId: user.username }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, empId: user.username });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Login failed.' });
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

        res.json({ mcq: quizData, practice: codeData });
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

        res.json(newQuestion);
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
        const progress = await Progress.findOne({ username: req.user.empId });
        res.json(progress ? progress.categories : {});
    } catch (error) {
        res.status(500).json({ message: 'Error fetching progress' });
    }
});

// --- LEADERBOARD ROUTE ---

app.get('/api/leaderboard', authenticateToken, async (req, res) => {
    try {
        const allProgress = await Progress.find({});
        const leaderboard = [];

        for (const p of allProgress) {
            let totalCorrect = 0;
            let totalPractice = 0;
            const data = p.categories;

            ['java', 'selenium', 'sql'].forEach(cat => {
                if (data[cat]) {
                    totalCorrect += Object.values(data[cat].mcq || {}).filter(q => q.status === 'correct').length;
                    totalPractice += Object.values(data[cat].practice || {}).filter(q => q.status === 'correct').length;
                }
            });

            leaderboard.push({
                empId: p.username,
                totalCorrect,
                totalPractice,
                score: totalCorrect + (totalPractice * 5)
            });
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

        await p.save();
        res.json({ message: 'Progress updated' });
    } catch (error) {
        console.error('Progress Update Error:', error);
        res.status(500).json({ message: 'Failed to update progress' });
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
