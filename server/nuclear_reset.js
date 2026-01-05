require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

async function nuclearReset() {
    console.log('--- [CAUTION] INTERIMATE NUCLEAR RESET PROTOCOL ---');
    console.log('WARNING: This will permanently erase all Users, Progress, OTPs, and Generated Questions.');

    if (!process.env.MONGODB_URI) {
        console.error('ERROR: MONGODB_URI not found in .env');
        process.exit(1);
    }

    try {
        console.log('[1/3] Connecting to Sigma Cloud Cluster...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('      -> Connection Established.');

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();

        console.log(`[2/3] Found ${collections.length} active collections.`);

        for (const col of collections) {
            console.log(`      -> Dropping collection: ${col.name}`);
            await db.collection(col.name).drop();
        }

        console.log('[3/3] Purge Complete.');
        console.log('------------------------------------------');
        console.log('--- [STATUS] SYSTEM DATA: NULL ---');
        console.log('--- [STATUS] READY FOR FRESH INITIALIZATION ---');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('CRITICAL ERROR during reset:', error.message);
        process.exit(1);
    }
}

nuclearReset();
