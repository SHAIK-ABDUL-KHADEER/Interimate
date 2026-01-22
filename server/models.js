const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    plan: { type: String, default: 'free' }, // free, paid
    interviewCredits: { type: Number, default: 0 },
    lastTopicInterview: { type: Date, default: null },
    lastResumeInterview: { type: Date, default: null },
    badges: { type: Array, default: [] }, // [{ id, title, description, earnedAt, verificationId, stars }]
    createdAt: { type: Date, default: Date.now }
});

// OTP Schema (expires after 10 minutes)
const otpSchema = new mongoose.Schema({
    email: { type: String, required: true },
    otp: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, index: { expires: 600 } }
});

// Question Schema (Unified for Quiz and Code)
const questionSchema = new mongoose.Schema({
    category: { type: String, required: true }, // java, selenium, sql
    type: { type: String, required: true }, // quiz, code
    id: { type: Number, required: true },
    data: { type: Object, required: true } // Stores the full question/challenge JSON object
});

// Progress Schema
const progressSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    categories: { type: Object, default: {} } // Stores { java: { mcq: {...}, practice: {...} }, ... }
});

// Interview Schema
const interviewSchema = new mongoose.Schema({
    username: { type: String, required: true },
    type: { type: String, required: true }, // topic, resume
    topics: { type: [String], default: [] },
    resumeText: { type: String, default: '' },
    interviewerName: { type: String, default: 'Agent Sigma' },
    history: { type: [Object], default: [] }, // [{ question, answer, feedback }]
    status: { type: String, default: 'active' }, // active, completed
    report: { type: Object, default: null }, // { strengths, improvements, score }
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Question = mongoose.model('Question', questionSchema);
const Progress = mongoose.model('Progress', progressSchema);
const OTP = mongoose.model('OTP', otpSchema);
const Interview = mongoose.model('Interview', interviewSchema);

module.exports = { User, Question, Progress, OTP, Interview };
