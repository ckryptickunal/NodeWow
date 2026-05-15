import { Queue, type ConnectionOptions } from 'bullmq';
import { config } from './config.js';

function parseRedisUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || '127.0.0.1',
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
  };
}

export const redisConnection = parseRedisUrl(config.redisUrl);

export const orchestrateQueue = new Queue('orchestrate', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const frameQueue = new Queue('generate-frame', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const videoQueue = new Queue('generate-video', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 15000 },
    removeOnComplete: 50,
    removeOnFail: 20,
  },
});
