const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read environment variables
const isDev = process.env.NODE_ENV !== 'production';
const port = process.env.PORT || '3000';
const portFile = process.env.PORT_FILE; // only set in production

if (!isDev && !portFile) {
    console.error("PORT_FILE environment variable is not defined");
    process.exit(1);
}

// Write the port to the port.info file only in production
if (!isDev) {
    try {
        fs.writeFileSync(portFile, port.toString(), 'utf8');
        console.log(`Port ${port} written to ${portFile}`);
    } catch (err) {
        console.error('Failed to write port info:', err);
        process.exit(1);
    }
}

const exeDir = path.dirname(process.execPath);
const upDir = path.join(exeDir, '_up_');

// Function to spawn a process
function spawnProcess(command, args, env = {}) {
    return spawn(command, args, {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, ...env }
    });
}

if (isDev) {
    console.log('Running in development mode');

    // Start Next.js dev server
    const nextDev = spawnProcess('npm', ['run', 'dev:next'], { PORT: port });
    nextDev.on('error', (err) => {
        console.error('Failed to start Next.js dev server:', err);
    });

    // Start log watcher
    const logWatcher = spawnProcess('npm', ['run', 'update-from-log']);
    logWatcher.on('error', (err) => {
        console.error('Failed to start log watcher:', err);
    });

    // Start sync check
    const syncCheck = spawnProcess('npm', ['run', 'sync-check']);
    syncCheck.on('error', (err) => {
        console.error('Failed to start sync check:', err);
    });

} else {
    console.log('Running in production mode');

    // Start Next.js optimized server
    const nextStart = spawnProcess('npx', ['next', 'start', '-p', port]);
    nextStart.on('error', (err) => {
        console.error('Failed to start Next.js server:', err);
    });

    // Start log watcher
    const logWatcher = spawnProcess('npm', ['run', 'update-from-log']);
    logWatcher.on('error', (err) => {
        console.error('Failed to start log watcher:', err);
    });

    // Start sync check
    const syncCheck = spawnProcess('npm', ['run', 'sync-check']);
    syncCheck.on('error', (err) => {
        console.error('Failed to start sync check:', err);
    });
}
