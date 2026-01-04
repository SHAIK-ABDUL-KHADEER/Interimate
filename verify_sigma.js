const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function verify() {
    console.log('--- SIGMA DIAGNOSTIC TOOL ---');
    console.log('ENV PATH:', path.resolve('.env'));

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error('ERROR: GEMINI_API_KEY is missing from .env');
        return;
    }

    console.log('API KEY:', key.substring(0, 6) + '...' + key.substring(key.length - 4));
    console.log('MODEL:', process.env.GEMINI_MODEL);

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

    try {
        console.log('\n[1/2] Testing Gemini Connectivity...');
        const result = await model.generateContent("Respond with only the word 'ACTIVE'");
        const response = await result.response;
        console.log('      -> STATUS:', response.text().trim());

        console.log('\n[2/2] Checking File System...');
        const dataDir = path.join(__dirname, 'data');
        if (!require('fs').existsSync(dataDir)) {
            console.error('      -> ERROR: data directory missing!');
        } else {
            console.log('      -> data directory OK');
        }

        console.log('\n--- DIAGNOSTIC COMPLETE ---');
        console.log('If the above is ACTIVE, your server should work.');
        console.log('Please run: Stop-Process -Id $(netstat -ano | findstr :3000 | ForEach-Object { $_.Split(" ")[-1] }) -Force');
        console.log('Then: node server/server.js');
    } catch (e) {
        console.error('\n!!! GEMINI ERROR !!!');
        console.error(e.message);
    }
}

verify();
