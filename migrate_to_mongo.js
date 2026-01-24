const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const { User, Question, Progress } = require('./server/models');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, 'data');
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
}

async function migrate() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB Atlas...');

        const files = await fs.readdir(DATA_DIR);

        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            console.log(`Migrating ${file}...`);
            const content = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
            const data = JSON.parse(content);

            if (file === 'users.json') {
                for (const [username, password] of Object.entries(data)) {
                    await User.findOneAndUpdate({ username }, { password }, { upsert: true });
                }
            } else if (file === 'progress.json') {
                for (const [username, categories] of Object.entries(data)) {
                    await Progress.findOneAndUpdate({ username }, { categories }, { upsert: true });
                }
            } else if (file.includes('_quiz.json') || file.includes('_code.json')) {
                const parts = file.split('_');
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

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

migrate();
