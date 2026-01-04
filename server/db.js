const mongoose = require('mongoose');
const { User, Question, Progress } = require('./models');

// filename mapping logic:
// users.json -> User
// progress.json -> Progress
// [category]_[quiz|code].json -> Question

async function readJSON(filename) {
  try {
    if (filename === 'users.json') {
      const users = await User.find({});
      const map = {};
      users.forEach(u => map[u.empId] = {
        password: u.password,
        createdAt: u.createdAt
      });
      return map;
    }
    if (filename === 'progress.json') {
      const progress = await Progress.find({});
      const map = {};
      progress.forEach(p => map[p.empId] = p.categories);
      return map;
    }
    // Questions: sql_quiz.json, java_code.json etc.
    const parts = filename.split('_');
    if (parts.length === 2) {
      const category = parts[0];
      const type = parts[1].split('.')[0];
      const questions = await Question.find({ category, type });
      return questions.sort((a, b) => a.id - b.id).map(q => q.data);
    }
  } catch (error) {
    console.error(`[DB Bridge] Read error for ${filename}:`, error.message);
  }
  return (filename.includes('quiz') || filename.includes('code')) ? [] : {};
}

async function writeJSON(filename, data) {
  try {
    if (filename === 'users.json') {
      for (const [empId, userData] of Object.entries(data)) {
        await User.findOneAndUpdate(
          { empId },
          { password: userData.password, createdAt: userData.createdAt },
          { upsert: true }
        );
      }
    } else if (filename === 'progress.json') {
      for (const [empId, categories] of Object.entries(data)) {
        await Progress.findOneAndUpdate({ empId }, { categories }, { upsert: true });
      }
    } else {
      const parts = filename.split('_');
      if (parts.length === 2) {
        const category = parts[0];
        const type = parts[1].split('.')[0];
        if (Array.isArray(data)) {
          for (const qData of data) {
            await Question.findOneAndUpdate(
              { category, type, id: qData.id },
              { data: qData },
              { upsert: true }
            );
          }
        }
      }
    }
  } catch (error) {
    console.error(`[DB Bridge] Write error for ${filename}:`, error.message);
  }
}

module.exports = { readJSON, writeJSON };
