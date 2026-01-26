const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { Interview, Question } = require('./models');

async function purgeInterviews() {
    console.log('--- [INTERIMATE] DATA PURGE PROTOCOL: INTERVIEWS ---');

    if (!process.env.MONGODB_URI) {
        console.error('ERROR: MONGODB_URI not found in .env');
        process.exit(1);
    }

    try {
        console.log('[1/3] Connecting to Sigma Cloud Cluster...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('      -> Connection Established.');

        console.log('[2/3] Terminating all Interview Sessions...');
        const intResult = await Interview.deleteMany({});
        console.log(`      -> Deleted ${intResult.deletedCount} interview records.`);

        console.log('[3/3] Pursuing Interview Cache Deletion...');
        const cacheResult = await Question.deleteMany({ type: 'interview_cache' });
        console.log(`      -> Deleted ${cacheResult.deletedCount} cached questions.`);

        console.log('------------------------------------------');
        console.log('--- [STATUS] INTERVIEW DATA: RESET ---');
        console.log('--- [STATUS] READY FOR FRESH GENERATION ---');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('CRITICAL ERROR during purge:', error.message);
        process.exit(1);
    }
}

purgeInterviews();
