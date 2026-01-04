const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
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

const User = mongoose.model('User', userSchema);
const Question = mongoose.model('Question', questionSchema);
const Progress = mongoose.model('Progress', progressSchema);
const OTP = mongoose.model('OTP', otpSchema);

module.exports = { User, Question, Progress, OTP };
