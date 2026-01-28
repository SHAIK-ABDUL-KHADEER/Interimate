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
questionSchema.index({ category: 1, type: 1, id: 1 }, { unique: true });

// Progress Schema
const progressSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    categories: { type: Object, default: {} } // Stores { java: { mcq: {...}, practice: {...} }, ... }
});
progressSchema.index({ username: 1 }, { unique: true });

// Interview History Sub-Schema for strict persistence
const historyEntrySchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, default: null },
    feedback: { type: String, default: null },
    isCodeRequired: { type: Boolean, default: false }
}, { _id: false });

// Interview Schema
const interviewSchema = new mongoose.Schema({
    username: { type: String, required: true },
    type: { type: String, required: true }, // topic, resume, role-resume
    topics: { type: [String], default: [] },
    resumeText: { type: String, default: '' },
    targetRole: { type: String, default: '' },
    interviewerName: { type: String, default: 'Agent Sigma' },
    history: [historyEntrySchema],
    status: { type: String, default: 'active' }, // active, completed
    totalQuestions: { type: Number, default: 10 },
    report: { type: Object, default: null }, // { strengths, improvements, score, rag, summary }
    createdAt: { type: Date, default: Date.now }
});
interviewSchema.index({ username: 1, status: 1 });
interviewSchema.index({ username: 1, createdAt: -1 });

// Payment Schema (Replay Protection)
const paymentSchema = new mongoose.Schema({
    paymentId: { type: String, required: true, unique: true },
    orderId: { type: String, required: true },
    username: { type: String, required: true },
    amount: { type: Number },
    createdAt: { type: Date, default: Date.now }
});
paymentSchema.index({ paymentId: 1 }, { unique: true });
paymentSchema.index({ username: 1 });

// Competition Status Schema
const compStatusSchema = new mongoose.Schema({
    isActive: { type: Boolean, default: false },
    resultsReleased: { type: Boolean, default: false },
    startTime: { type: Date, default: null },
    systemId: { type: String, default: 'GLOBAL_COMP' }
});

// Competition Team Schema
const compTeamSchema = new mongoose.Schema({
    teamName: { type: String, required: true, unique: true },
    leaderUsername: { type: String, required: true },
    topic: { type: String, required: true }, // java, sql
    score: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    responses: { type: Array, default: [] }, // [{ question, userAnswer, correctAnswer, isCorrect }]
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null }
});

// Competition Question Schema (Separate from regular cache)
const compQuestionSchema = new mongoose.Schema({
    topic: { type: String, required: true },
    questionId: { type: Number, required: true },
    teamName: { type: String, required: true }, // Who it was originally generated for
    data: { type: Object, required: true }, // Full question object
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Question = mongoose.model('Question', questionSchema);
const Progress = mongoose.model('Progress', progressSchema);
const OTP = mongoose.model('OTP', otpSchema);
const Interview = mongoose.model('Interview', interviewSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const CompStatus = mongoose.model('CompStatus', compStatusSchema);
const CompTeam = mongoose.model('CompTeam', compTeamSchema);
const CompQuestion = mongoose.model('CompQuestion', compQuestionSchema);

module.exports = { User, Question, Progress, OTP, Interview, Payment, CompStatus, CompTeam, CompQuestion };
