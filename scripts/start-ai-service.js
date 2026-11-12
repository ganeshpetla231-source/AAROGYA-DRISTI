const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const serviceDirectory = path.join(root, 'ai-service');
const python = process.platform === 'win32'
  ? path.join(serviceDirectory, '.venv', 'Scripts', 'python.exe')
  : path.join(serviceDirectory, '.venv', 'bin', 'python');

if (!fs.existsSync(python)) {
  console.error('AI service Python environment is missing. Create ai-service/.venv and install ai-service/requirements.txt; see README.md.');
  process.exit(1);
}

const service = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8000'], {
  cwd: serviceDirectory,
  stdio: 'inherit'
});

service.on('error', error => {
  console.error(`Could not start the AI service: ${error.message}`);
  process.exitCode = 1;
});
service.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => service.kill(signal));
}
