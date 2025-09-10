const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Ensure we are in production
if (process.env.NODE_ENV === 'development') {
    console.error("This script is only for production");
    process.exit(1);
}

const port = process.env.PORT || '3000';
const portFile = process.env.PORT_FILE;

if (!portFile) {
    console.error("PORT_FILE environment variable is not defined");
    process.exit(1);
}

// Write port information to file
try {
    fs.writeFileSync(portFile, port.toString(), 'utf8');
    console.log(`Port ${port} written to ${portFile}`);
} catch (err) {
    console.error('Failed to write port info:', err);
    process.exit(1);
}

// Define paths
const nodePath = path.join(__dirname, '..', 'node', process.platform === 'win32' ? 'node.exe' : 'node');
const npmPath = path.join(__dirname, '..', 'node', 'node_modules', 'npm', 'lib', 'cli.js');

// Check if node exists
if (!fs.existsSync(nodePath)) {
    console.error('Node binary not found at', nodePath);
    process.exit(1);
}

// Check if npm exists
if (!fs.existsSync(npmPath)) {
    console.error('npm CLI script not found at', npmPath);
    process.exit(1);
}

// Helper to spawn processes
function spawnProcess(command, args, env = {}) {
    const proc = spawn(command, args, {
        stdio: 'inherit',
        shell: false,
        env: { ...process.env, ...env }
    });

    proc.on('error', (err) => {
        console.error(`Failed to start process ${command} ${args.join(' ')}:`, err);
    });

    return proc;
}

console.log('Running in production mode');

// Start Next.js optimized server
const nextStart = spawnProcess(nodePath, [npmPath, 'exec', '--', 'next', 'start', '-p', port]);

// Start log watcher
const logWatcher = spawnProcess(nodePath, [npmPath, 'run', 'update-from-log']);

// Start sync check
const syncCheck = spawnProcess(nodePath, [npmPath, 'run', 'sync-check']);
