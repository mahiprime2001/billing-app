const { spawn } = require('child_process');

// Start the Next.js dev server
const nextDev = spawn('npm', ['run', 'dev:next'], {
  stdio: 'inherit',
  shell: true
});

nextDev.on('error', (err) => {
  console.error('Failed to start Next.js dev server:', err);
});

// Start the log watcher
const logWatcher = spawn('npm', ['run', 'update-from-log'], {
  stdio: 'inherit',
  shell: true
});

logWatcher.on('error', (err) => {
  console.error('Failed to start log watcher:', err);
});
