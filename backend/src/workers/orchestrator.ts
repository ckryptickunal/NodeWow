import { Worker } from 'bullmq';
import { redisConnection, frameQueue } from '../queues.js';
import { orchestrate, friendlyError } from '../gemini.js';
import { emitRunEvent } from '../sse.js';
import { initRun, savePlan, markRunFailed } from '../runTracker.js';
import type { Plan } from '../schema.js';

export function startOrchestratorWorker() {
  const worker = new Worker(
    'orchestrate',
    async (job) => {
      const { runId, collatedPrompt, referenceDir, referenceFiles } = job.data as {
        runId: string;
        collatedPrompt: string;
        referenceDir?: string;
        referenceFiles?: string[];
      };

      let plan: Plan;
      try {
        plan = await orchestrate(collatedPrompt);
      } catch (err) {
        await markRunFailed(runId);
        emitRunEvent({
          type: 'orchestrator_failed',
          runId,
          data: { error: friendlyError(err) },
        });
        throw err;
      }

      await initRun(runId, plan.totalFrames);
      await savePlan(runId, plan);

      emitRunEvent({
        type: 'plan_ready',
        runId,
        data: { plan },
      });

      const frameJobs = plan.frames.map((frame) => ({
        name: `frame:${frame.id}`,
        data: {
          runId,
          frameId: frame.id,
          sceneId: frame.sceneId,
          frameIndex: frame.frameIndex,
          prompt: frame.prompt,
          referenceDir,
          referenceFiles,
        },
        opts: { jobId: `${runId}--${frame.id}` },
      }));

      await frameQueue.addBulk(frameJobs);

      for (const frame of plan.frames) {
        emitRunEvent({
          type: 'frame_queued',
          runId,
          data: { frameId: frame.id, sceneId: frame.sceneId },
        });
      }

      return { plan };
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[orchestrator] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
