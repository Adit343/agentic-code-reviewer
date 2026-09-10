export interface AppConfig {
  geminiApiKey: string;
  geminiModel: string;
  geminiChatModel: string;
  mongodbUri: string;
  redisUrl: string;
  appUrl: string;
  nodeEnv: string;
  logLevel: string;
  reviewTimeoutSeconds: number;
  maxRepositorySizeMb: number;
  maxFilesPerReview: number;
  isMockLlm: boolean;
}

const key = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
const isValidKey = key.length > 20 && key.startsWith('AIzaSy');

export const config: AppConfig = {
  geminiApiKey: key,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
  geminiChatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/agentic_code_reviewer',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  reviewTimeoutSeconds: parseInt(process.env.REVIEW_TIMEOUT_SECONDS || '600', 10),
  maxRepositorySizeMb: parseInt(process.env.MAX_REPOSITORY_SIZE_MB || '250', 10),
  maxFilesPerReview: parseInt(process.env.MAX_FILES_PER_REVIEW || '5000', 10),
  isMockLlm: !isValidKey,
};
