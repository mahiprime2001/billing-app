const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// --- Logging helpers ---
function log(msg) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
}

function errorLog(msg) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ${msg}`);
}

log('=== Server Startup ===');

// --- Ensure production mode ---
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

// --- Write port info ---
try {
    fs.writeFileSync(portFile, port.toString(), 'utf8');
    log(`✅ Port ${port} written to ${portFile}`);
} catch (err) {
    errorLog('❌ Failed to write port info: ' + err);
    process.exit(1);
}

// --- Node and NPM paths ---
const nodePath = path.join(__dirname, '..', 'node', process.platform === 'win32' ? 'node.exe' : 'node');
const npmPath = path.join(__dirname, '..', 'node', 'node_modules', 'npm', 'lib', 'cli.js');

log(`Step 2: Checking node and npm paths`);
log(`  Node path: ${nodePath}`);
log(`  NPM path: ${npmPath}`);

if (!fs.existsSync(nodePath)) {
    errorLog('❌ Node binary not found at ' + nodePath);
    process.exit(1);
}

if (!fs.existsSync(npmPath)) {
    errorLog('❌ npm CLI script not found at ' + npmPath);
    process.exit(1);
}

// --- Helper to spawn processes ---
function spawnProcess(command, args, env = {}, logFile = null, errorFile = null) {
    log(`Spawning process: ${command} ${args.join(' ')}`);

    const options = {
        env: { ...process.env, ...env },
        shell: true
    };

    if (logFile && errorFile) {
        options.stdio = [
            'pipe',
            fs.openSync(logFile, 'a'),
            fs.openSync(errorFile, 'a')
        ];
    } else {
        options.stdio = 'inherit';
    }

    const proc = spawn(command, args, options);

    proc.on('error', (err) => {
        errorLog(`❌ Failed to start process ${command} ${args.join(' ')}: ${err}`);
    });

    proc.on('exit', (code, signal) => {
        log(`Process exited: ${command} ${args.join(' ')} (code=${code}, signal=${signal})`);
    });

    return proc;
}

// --- Step 3: Start Next.js server ---
log('Step 3: Starting Next.js server');
const nextStart = spawnProcess(
    nodePath,
    [npmPath, 'exec', '--', 'next', 'start', '-p', port],
    {},
    path.join(__dirname, '..', 'logs', 'server.log'),
    path.join(__dirname, '..', 'logs', 'server-error.log')
);

// --- Step 4: Start additional processes ---
log('Step 4: Starting auxiliary processes');
const logWatcher = spawnProcess(
    nodePath,
    [npmPath, 'run', 'update-from-log'],
    {},
    path.join(__dirname, '..', 'logs', 'server.log'),
    path.join(__dirname, '..', 'logs', 'server-error.log')
);

const syncCheck = spawnProcess(
    nodePath,
    [npmPath, 'run', 'sync-check'],
    {},
    path.join(__dirname, '..', 'logs', 'server.log'),
    path.join(__dirname, '..', 'logs', 'server-error.log')
);

log('=== All child processes spawned ===');

// --- Step 5: Server readiness check ---
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

// Run server readiness check
checkServerReady().catch(() => {
    errorLog('Server startup failed: Tauri may show "Server Connection Error".');
});

// --- Handle unhandled errors ---
process.on('unhandledRejection', (reason) => {
    errorLog(`Unhandled Rejection: ${reason}`);
});

process.on('uncaughtException', (err) => {
    errorLog(`Uncaught Exception: ${err}`);
});
