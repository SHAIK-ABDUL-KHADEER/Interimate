const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { Question } = require('./models');

async function clearInterviewCache() {
    console.log('--- [INTERIMATE] CACHE PURGE PROTOCOL ---');

    if (!process.env.MONGODB_URI) {
        console.error('ERROR: MONGODB_URI not found in .env');
        process.exit(1);
    }

    try {
        console.log(`[1/2] Connecting to Sigma Cloud Cluster...`);
        console.log(`      URI detected: ${process.env.MONGODB_URI.split('@').pop()}`); // Log the host part for safety
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        console.log('      -> Connection Established.');

        console.log('[2/2] Pursuing Interview Cache Deletion...');
        const result = await Question.deleteMany({ type: 'interview_cache' });

        console.log(`      -> Purge Complete. Deleted ${result.deletedCount} cached questions.`);
        console.log('------------------------------------------');
        console.log('--- [STATUS] CACHE: EMPTY ---');
        console.log('--- [STATUS] READY FOR FRESH GENERATION ---');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('CRITICAL ERROR during cache purge:', error.message);
        process.exit(1);
    }
}

clearInterviewCache();
