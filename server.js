const fs = require('fs');
const path = require('path');
const http = require('http');

// --- Logging helper ---
function logStep(step, message, success = true, error) {
    const timestamp = new Date().toISOString();
    const status = success ? "✔ Success" : "❌ Failed";
    const errorMsg = error ? ` - Error: ${error.message || error}` : "";
    const line = `[${timestamp}] ${step}: ${message} -> ${status}${errorMsg}`;
    console.log(line);
    try {
        fs.appendFileSync(path.join(__dirname, '..', 'logs', 'server.log'), line + "\n");
    } catch (_) {
        // ignore if logs folder not ready
    }
}

logStep("Startup", "=== Server Startup ===");

// --- Ensure production mode ---
if (process.env.NODE_ENV === 'development') {
    logStep("Startup", "This script is only for production", false, "NODE_ENV=development");
    process.exit(1);
}

// --- Step 1: Get port from CLI args ---
const args = process.argv.slice(2);
let port = '3000';
const portIndex = args.indexOf('-p');
if (portIndex !== -1 && args[portIndex + 1]) {
    port = args[portIndex + 1];
}
logStep("Step 1", `Port detected from CLI args: ${port}`);

// --- Step 2: PORT_FILE env ---
const portFile = process.env.PORT_FILE;
logStep("Step 2", `PORT_FILE=${portFile || '(none)'}`);

if (!portFile) {
    logStep("Step 2", "PORT_FILE environment variable is not defined", false, "Missing env var");
    process.exit(1);
}

try {
    fs.writeFileSync(portFile, port.toString(), 'utf8');
    logStep("Step 2", `Port ${port} written to ${portFile}`);
} catch (err) {
    logStep("Step 2", "Failed to write port info", false, err);
    process.exit(1);
}

// --- Step 3: Start Next.js (using next start) ---
const { spawn } = require('child_process');

function spawnProcess(step, command, args) {
    logStep(step, `Spawning: ${command} ${args.join(' ')}`);

    const proc = spawn(command, args, { shell: true, stdio: 'inherit' });

    proc.on('error', (err) => {
        logStep(step, `Process failed: ${command} ${args.join(' ')}`, false, err);
    });

    proc.on('exit', (code, signal) => {
        const msg = `Exited (code=${code}, signal=${signal})`;
        logStep(step, msg, code === 0);
    });

    return proc;
}

logStep("Step 3", "Starting Next.js server");
const nextStart = spawnProcess("Step 3", "npx", ["next", "start", "-p", port]);

// --- Step 4: Auxiliary processes ---
logStep("Step 4", "Starting auxiliary processes");

spawnProcess("Step 4", "npm", ["run", "update-from-log"]);
spawnProcess("Step 4", "npm", ["run", "sync-check"]);

logStep("Startup", "All processes spawned");

// --- Step 5: Server readiness check ---
function checkServerReady(retries = 50, delay = 200) {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const interval = setInterval(() => {
            const req = http.get(`http://localhost:${port}`, (res) => {
                if (res.statusCode === 200) {
                    logStep("Step 5", `Next.js server is ready on port ${port}`);
                    clearInterval(interval);
                    resolve(true);
                } else {
                    logStep("Step 5", `Server responded with ${res.statusCode}, retrying...`);
                }
            });

            req.on('error', () => {
                logStep("Step 5", `Waiting for server... attempt ${attempts + 1}`);
            });

            req.end();
            attempts++;
            if (attempts >= retries) {
                clearInterval(interval);
                logStep("Step 5", "Next.js server did not respond in time.", false);
                reject(false);
            }
        }, delay);
    });
}

checkServerReady().catch(() => {
    logStep("Startup", 'Server startup failed: Tauri may show "Server Connection Error".', false);
});

// --- Handle unhandled errors ---
process.on('unhandledRejection', (reason) => {
    logStep("Runtime", "Unhandled Rejection", false, reason);
});

process.on('uncaughtException', (err) => {
    logStep("Runtime", "Uncaught Exception", false, err);
});
