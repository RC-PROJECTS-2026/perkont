import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  encryptionKey: process.env.ENCRYPTION_KEY,
  reportVerifyBaseUrl: process.env.REPORT_VERIFY_BASE_URL,
  logLevel: process.env.LOG_LEVEL || 'info',
  logFilePath: process.env.LOG_FILE_PATH || './logs',
}));
