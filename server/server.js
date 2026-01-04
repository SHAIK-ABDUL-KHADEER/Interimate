const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { readJSON, writeJSON } = require('./db');
const { generateQuestion, validateCode } = require('./geminiService');
const fs = require('fs').promises;

const app = express();
const PORT = 3005; // FORCED PORT CHANGE TO BYPASS GHOSTS
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

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Diagnostic Middleware
app.use((req, res, next) => {
    res.setHeader('X-Core-Sigma', `CORE_VERSION_3.0_SIGMA_${START_TIME}`);
    next();
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

app.post('/api/register', async (req, res) => {
    console.log('Register request received:', req.body);
    const { empId, password } = req.body;
    const users = await readJSON('users.json');

    if (users[empId]) {
        return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users[empId] = {
        password: hashedPassword,
        createdAt: new Date().toISOString()
    };

    await writeJSON('users.json', users);
    res.status(201).json({ message: 'User registered successfully' });
});

app.post('/api/login', async (req, res) => {
    console.log('Login request received:', req.body);
    const { empId, password } = req.body;
    const users = await readJSON('users.json');
    const user = users[empId];

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ empId }, SECRET_KEY, { expiresIn: '24h' });
    res.json({ token, empId });
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
    const progress = await readJSON('progress.json');
    res.json(progress[req.user.empId] || {});
});

// --- LEADERBOARD ROUTE ---

app.get('/api/leaderboard', authenticateToken, async (req, res) => {
    const progress = await readJSON('progress.json');
    const leaderboard = [];

    for (const [empId, data] of Object.entries(progress)) {
        let totalCorrect = 0;
        let totalPractice = 0;

        ['java', 'selenium', 'sql'].forEach(cat => {
            if (data[cat]) {
                totalCorrect += Object.values(data[cat].mcq || {}).filter(q => q.status === 'correct').length;
                totalPractice += Object.values(data[cat].practice || {}).filter(q => q.status === 'correct').length;
            }
        });

        leaderboard.push({
            empId,
            totalCorrect,
            totalPractice,
            score: totalCorrect + (totalPractice * 5) // Practice counts more
        });
    }

    // Sort by score descending
    leaderboard.sort((a, b) => b.score - a.score);
    res.json(leaderboard.slice(0, 10)); // Top 10
});

app.post('/api/progress', authenticateToken, async (req, res) => {
    const { category, section, questionId, status, response, feedback } = req.body;
    const progress = await readJSON('progress.json');
    const userProgress = progress[req.user.empId] || {};

    if (!userProgress[category]) {
        userProgress[category] = { mcq: {}, practice: {}, lastVisited: {} };
    }

    if (section === 'mcq') {
        userProgress[category].mcq[questionId] = { status, response, timestamp: new Date().toISOString() };
        userProgress[category].lastVisited.mcq = questionId;
    } else if (section === 'practice') {
        userProgress[category].practice[questionId] = { status, response, feedback, timestamp: new Date().toISOString() };
        userProgress[category].lastVisited.practice = questionId;
    }

    progress[req.user.empId] = userProgress;
    await writeJSON('progress.json', progress);
    res.json({ message: 'Progress updated' });
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
