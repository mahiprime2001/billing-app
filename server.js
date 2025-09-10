const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Helper to log with timestamp
function log(msg) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
}

function errorLog(msg) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ${msg}`);
}

log('=== Server Startup ===');

// Ensure we are in production
if (process.env.NODE_ENV === 'development') {
    errorLog("This script is only for production");
    process.exit(1);
}

const port = process.env.PORT || '3000';
const portFile = process.env.PORT_FILE;

log(`Step 1: Environment variables - PORT=${port}, PORT_FILE=${portFile || '(none)'}`);

if (!portFile) {
    errorLog("PORT_FILE environment variable is not defined");
    process.exit(1);
}

// Write port information to file
try {
    fs.writeFileSync(portFile, port.toString(), 'utf8');
    log(`✅ Port ${port} written to ${portFile}`);
} catch (err) {
    errorLog('❌ Failed to write port info: ' + err);
    process.exit(1);
}

// Define paths
const nodePath = path.join(__dirname, '..', 'node', process.platform === 'win32' ? 'node.exe' : 'node');
const npmPath = path.join(__dirname, '..', 'node', 'node_modules', 'npm', 'lib', 'cli.js');

log(`Step 2: Checking node and npm paths`);
log(`  Node path: ${nodePath}`);
log(`  NPM path: ${npmPath}`);

// Check if node exists
if (!fs.existsSync(nodePath)) {
    errorLog('❌ Node binary not found at ' + nodePath);
    process.exit(1);
}

// Check if npm exists
if (!fs.existsSync(npmPath)) {
    errorLog('❌ npm CLI script not found at ' + npmPath);
    process.exit(1);
}

// Helper to spawn processes
function spawnProcess(command, args, env = {}) {
    log(`Spawning process: ${command} ${args.join(' ')}`);
    const proc = spawn(command, args, {
        stdio: 'inherit',
        shell: false,
        env: { ...process.env, ...env }
    });

    proc.on('error', (err) => {
        errorLog(`❌ Failed to start process ${command} ${args.join(' ')}: ${err}`);
    });

    proc.on('exit', (code, signal) => {
        log(`Process exited: ${command} ${args.join(' ')} (code=${code}, signal=${signal})`);
    });

    return proc;
}

log('Step 3: Running in production mode');

// Start Next.js optimized server
const nextStart = spawnProcess(nodePath, [npmPath, 'exec', '--', 'next', 'start', '-p', port]);

// Wait for server readiness
function checkServerReady(retries = 50, delay = 200) {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const interval = setInterval(() => {
            const req = http.get(`http://localhost:${port}`, (res) => {
                if (res.statusCode === 200) {
                    log(`✅ Next.js server is ready on port ${port}`);
                    clearInterval(interval);
                    resolve(true);
                } else {
                    log(`⚠️ Server responded with status ${res.statusCode}, retrying...`);
                }
            });

            req.on('error', () => {
                log(`Waiting for server... attempt ${attempts + 1}`);
            });

            req.end();
            attempts++;
            if (attempts >= retries) {
                clearInterval(interval);
                errorLog('❌ Next.js server did not respond in time.');
                reject(false);
            }
        }, delay);
    });
}

// Start log watcher
const logWatcher = spawnProcess(nodePath, [npmPath, 'run', 'update-from-log']);

// Start sync check
const syncCheck = spawnProcess(nodePath, [npmPath, 'run', 'sync-check']);

log('=== All child processes spawned ===');

// Check server readiness
checkServerReady().catch(() => {
    errorLog('Server startup failed: Tauri may show "Server Connection Error".');
});

// Catch unhandled promise rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
    errorLog(`Unhandled Rejection: ${reason}`);
});

process.on('uncaughtException', (err) => {
    errorLog(`Uncaught Exception: ${err}`);
});
