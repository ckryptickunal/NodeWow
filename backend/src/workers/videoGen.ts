import { Worker } from 'bullmq';
import { readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { redisConnection } from '../queues.js';
import { config } from '../config.js';
import { generateMotionPrompt, generateVideo, friendlyError } from '../gemini.js';
import { emitRunEvent } from '../sse.js';
import { saveVideoStatus } from '../runTracker.js';

export function startVideoGenWorker() {
  const worker = new Worker(
    'generate-video',
    async (job) => {
      const { runId, frameId, prompt, imagePath } = job.data as {
        runId: string;
        frameId: string;
        prompt: string;
        imagePath: string;
      };

      await saveVideoStatus(runId, frameId, 'generating');

      emitRunEvent({
        type: 'video_started',
        runId,
        data: { frameId },
      });

      try {
        const imageBuffer = await readFile(imagePath);
        const imageBytes = imageBuffer.toString('base64');

        const motionPrompt = await generateMotionPrompt(prompt);

        await saveVideoStatus(runId, frameId, 'generating', { motionPrompt });

        emitRunEvent({
          type: 'video_motion_ready',
          runId,
          data: { frameId, motionPrompt },
        });

        const dir = join(config.storagePath, 'runs', runId);
        await mkdir(dir, { recursive: true });
        const videoFilename = `${frameId}-video.mp4`;
        const outputPath = join(dir, videoFilename);

        await generateVideo(imageBytes, motionPrompt, outputPath);

        const videoUrl = `/api/assets/runs/${runId}/${videoFilename}`;

        await saveVideoStatus(runId, frameId, 'ready', { videoUrl, motionPrompt });

        emitRunEvent({
          type: 'video_done',
          runId,
          data: { frameId, videoUrl, motionPrompt },
        });

        return { frameId, videoUrl };
      } catch (err) {
        const errMsg = friendlyError(err);
        await saveVideoStatus(runId, frameId, 'failed', { error: errMsg });
        emitRunEvent({
          type: 'video_failed',
          runId,
          data: { frameId, error: errMsg },
        });
        throw err;
      }
    },
    { connection: redisConnection, concurrency: 2, lockDuration: 300_000 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[video-gen] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
