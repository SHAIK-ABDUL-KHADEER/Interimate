const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { Interview, Question } = require('./models');

async function purgeInterviews() {
    console.log('--- [INTERIMATE] DATA PURGE PROTOCOL ---');

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('ERROR: MONGODB_URI not found in .env');
        process.exit(1);
    }

    console.log(`Connecting to: ${uri.replace(/\/\/.*@/, '//****:****@')}`);

    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        console.log('--- [SUCCESS] DATABASE CONNECTED ---');

        console.log('[1/2] Terminating all Interview Sessions...');
        const intResult = await Interview.deleteMany({});
        console.log(`      -> Deleted ${intResult.deletedCount} interview records.`);

        console.log('[2/2] Pursuing Interview Cache Deletion...');
        const cacheResult = await Question.deleteMany({ type: 'interview_cache' });
        console.log(`      -> Deleted ${cacheResult.deletedCount} cached questions.`);

        console.log('------------------------------------------');
        console.log('--- [STATUS] INTERVIEW DATA: RESET ---');
        console.log('--- [STATUS] READY FOR FRESH GENERATION ---');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('--- [CRITICAL ERROR] ---');
        console.error(error.message);
        console.log('TIP: Ensure your MongoDB server is RUNNING before executing this script.');
        process.exit(1);
    }
}

purgeInterviews();
