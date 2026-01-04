const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('--- INTERIMATE EMERGENCY CLEAN RESTART ---');

// 1. Kill any process on port 3000
try {
    console.log('[1/3] Terminating any ghost processes on port 3000...');
    const output = execSync('netstat -ano | findstr :3000').toString();
    const lines = output.trim().split('\n');
    lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
            try {
                execSync(`taskkill /F /PID ${pid}`);
                console.log(`      -> Killed PID ${pid}`);
            } catch (e) {
                // Ignore if already dead
            }
        }
    });
} catch (e) {
    console.log('      -> No active processes found on port 3000.');
}

// 2. Clear corrupted data files (keep users and progress)
console.log('[2/3] Cleaning data directory...');
const dataDir = path.join(__dirname, 'data');
if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir);
    files.forEach(file => {
        if (!['users.json', 'progress.json'].includes(file)) {
            fs.unlinkSync(path.join(dataDir, file));
            console.log(`      -> Deleted ${file}`);
        }
    });
}

// 3. Start the server
console.log('[3/3] Launching fresh server instance...');
console.log('------------------------------------------');
const { spawn } = require('child_process');
const server = spawn('node', ['server/server.js'], { stdio: 'inherit' });

server.on('error', (err) => {
    console.error('Failed to start server:', err);
});
