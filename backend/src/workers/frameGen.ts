import { Worker } from 'bullmq';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { redisConnection } from '../queues.js';
import { generateFrameImage, friendlyError } from '../gemini.js';
import { emitRunEvent } from '../sse.js';
import { markFrameCompleted, markFramePermanentlyFailed, saveFrameStatus } from '../runTracker.js';
import { config } from '../config.js';

const THUMB_WIDTH = 480;

interface ReferenceImage {
  mimeType: string;
  data: string;
}

async function loadReferenceImages(
  referenceDir?: string,
  referenceFiles?: string[],
): Promise<ReferenceImage[]> {
  if (!referenceDir || !referenceFiles?.length) return [];

  const images: ReferenceImage[] = [];
  for (const filename of referenceFiles) {
    try {
      const buf = await readFile(join(referenceDir, filename));
      const ext = filename.split('.').pop()?.toLowerCase() ?? 'png';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
      };
      images.push({
        mimeType: mimeMap[ext] ?? 'image/png',
        data: buf.toString('base64'),
      });
    } catch {
      console.warn(`[frame-gen] Could not load reference: ${filename}`);
    }
  }
  return images;
}

export function startFrameGenWorker() {
  const worker = new Worker(
    'generate-frame',
    async (job) => {
      const { runId, frameId, prompt, referenceDir, referenceFiles, imageSize } = job.data as {
        runId: string;
        frameId: string;
        sceneId: string;
        frameIndex: number;
        prompt: string;
        referenceDir?: string;
        referenceFiles?: string[];
        imageSize?: string;
      };

      const isLastAttempt = (job.attemptsMade + 1) >= (job.opts?.attempts ?? 2);

      emitRunEvent({
        type: 'frame_started',
        runId,
        data: { frameId },
      });

      try {
        const refs = await loadReferenceImages(referenceDir, referenceFiles);
        const imageBuffer = await generateFrameImage(prompt, refs, imageSize);

        const dir = join(config.storagePath, 'runs', runId);
        await mkdir(dir, { recursive: true });

        const thumbBuffer = await sharp(imageBuffer)
          .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
          .png({ quality: 80 })
          .toBuffer();

        await Promise.all([
          writeFile(join(dir, `${frameId}.png`), imageBuffer),
          writeFile(join(dir, `${frameId}-thumb.png`), thumbBuffer),
        ]);

        const assetUrl = `/api/assets/runs/${runId}/${frameId}.png`;
        const thumbUrl = `/api/assets/runs/${runId}/${frameId}-thumb.png`;

        await saveFrameStatus(runId, frameId, 'complete', { assetUrl, thumbUrl });
        emitRunEvent({
          type: 'frame_done',
          runId,
          data: { frameId, assetUrl, thumbUrl },
        });

        await markFrameCompleted(runId);
        return { frameId };
      } catch (err) {
        const errMsg = friendlyError(err);

        if (isLastAttempt) {
          await saveFrameStatus(runId, frameId, 'failed', { error: errMsg });
        }
        emitRunEvent({
          type: 'frame_failed',
          runId,
          data: { frameId, error: errMsg },
        });

        if (isLastAttempt) {
          await markFramePermanentlyFailed(runId);
        }

        throw err;
      }
    },
    { connection: redisConnection, concurrency: config.frameQueueConcurrency },
  );

  worker.on('failed', (job, err) => {
    console.error(`[frame-gen] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
