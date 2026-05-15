import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });
dotenv.config(); // fallback: cwd/.env

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  geminiApiKey: process.env.GEMINI_API_KEY!,
  orchestratorModel: process.env.ORCHESTRATOR_MODEL || 'gemini-2.5-flash',
  imageModel: process.env.IMAGE_MODEL || 'gemini-3-pro-image-preview',
  videoModel: process.env.VIDEO_MODEL || 'veo-3.1-generate-preview',
  imageSize: process.env.IMAGE_SIZE || '4K',
  imageAspectRatio: process.env.IMAGE_ASPECT_RATIO || '16:9',
  frameQueueConcurrency: parseInt(process.env.FRAME_QUEUE_CONCURRENCY || '5', 10),
  storagePath: resolve(__dirname, process.env.STORAGE_PATH || '../storage'),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
} as const;
