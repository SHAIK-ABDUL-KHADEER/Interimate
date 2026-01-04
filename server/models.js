const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
    empId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: String }
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
    empId: { type: String, required: true, unique: true },
    categories: { type: Object, default: {} } // Stores { java: { mcq: {...}, practice: {...} }, ... }
});

const User = mongoose.model('User', userSchema);
const Question = mongoose.model('Question', questionSchema);
const Progress = mongoose.model('Progress', progressSchema);

module.exports = { User, Question, Progress };
