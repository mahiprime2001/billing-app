import fs from 'fs';
import path from 'path';

const logsDir = path.join(process.cwd(), 'app', 'data', 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export const logChange = (fileName: string, change: string) => {
  const logFilePath = path.join(logsDir, `${fileName}.log`);
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${change}\n`;

  fs.appendFileSync(logFilePath, logMessage);
};

export const createLog = async (logFilePath: string, content: string) => {
  await fs.promises.writeFile(logFilePath, content, "utf-8");
};
