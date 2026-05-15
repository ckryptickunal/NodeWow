import { PassThrough } from 'stream';
import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { RunRequestSchema } from '../schema.js';
import { orchestrateQueue, frameQueue, videoQueue } from '../queues.js';
import { runEvents, emitRunEvent, type RunEvent } from '../sse.js';
import { createRun, listRuns, getRunDetails, markRunKilled, resetRunForRetry, saveFrameStatus, deleteRun, bumpPendingForFrameRetry } from '../runTracker.js';
import { config } from '../config.js';

export async function runsRoutes(app: FastifyInstance) {
  /* ── Create run (accepts JSON or multipart with reference images) ── */
  app.post('/api/runs', async (request, reply) => {
    let collatedPrompt = '';
    let imageSize = '';
    const refFilenames: string[] = [];
    let runId = uuidv4();

    const contentType = request.headers['content-type'] ?? '';

    if (contentType.includes('multipart/form-data')) {
      const parts = request.parts();
      const refDir = join(config.storagePath, 'runs', runId, 'references');
      await mkdir(refDir, { recursive: true });

      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'collatedPrompt') {
          collatedPrompt = (part.value as string) ?? '';
        } else if (part.type === 'field' && part.fieldname === 'imageSize') {
          imageSize = (part.value as string) ?? '';
        } else if (part.type === 'file' && part.fieldname === 'references') {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          const buf = Buffer.concat(chunks);
          if (buf.length > 0) {
            const filename = part.filename ?? `ref-${refFilenames.length + 1}.png`;
            await writeFile(join(refDir, filename), buf);
            refFilenames.push(filename);
          }
        }
      }
    } else {
      const body = request.body as { collatedPrompt?: string; imageSize?: string };
      collatedPrompt = body.collatedPrompt ?? '';
      imageSize = body.imageSize ?? '';
    }

    if (!collatedPrompt || collatedPrompt.trim().length < 10) {
      return reply.status(400).send({ error: 'Prompt must be at least 10 characters' });
    }

    await createRun(runId, collatedPrompt, imageSize || undefined);
    await orchestrateQueue.add('orchestrate', {
      runId,
      collatedPrompt,
      referenceDir: refFilenames.length > 0
        ? join(config.storagePath, 'runs', runId, 'references')
        : undefined,
      referenceFiles: refFilenames,
      imageSize: imageSize || undefined,
    }, { jobId: runId });

    return reply.send({ runId, eventsUrl: `/api/runs/${runId}/events`, references: refFilenames.length });
  });

  /* ── Kill a running generation ── */
  app.post('/api/runs/:runId/kill', async (request, reply) => {
    const { runId } = request.params as { runId: string };

    const waiting = await frameQueue.getJobs(['waiting', 'delayed']);
    let removed = 0;
    for (const job of waiting) {
      if (job.data?.runId === runId) {
        try { await job.remove(); removed++; } catch { /* already processing */ }
      }
    }

    const active = await frameQueue.getJobs(['active']);
    let signalled = 0;
    for (const job of active) {
      if (job.data?.runId === runId) {
        try { await job.moveToFailed(new Error('Killed by user'), '0', true); signalled++; } catch { /* ignore */ }
      }
    }

    const orchWaiting = await orchestrateQueue.getJobs(['waiting', 'delayed']);
    for (const job of orchWaiting) {
      if (job.data?.runId === runId) {
        try { await job.remove(); } catch { /* ignore */ }
      }
    }

    await markRunKilled(runId);

    emitRunEvent({
      type: 'run_killed',
      runId,
      data: { removed, signalled },
    });

    return reply.send({ ok: true, removed, signalled });
  });

  /* ── Retry failed frames ── */
  app.post('/api/runs/:runId/retry', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const details = await getRunDetails(runId);
    if (!details) return reply.status(404).send({ error: 'Run not found' });

    const failedFrameIds: string[] = [];
    for (const [fid, fdata] of Object.entries(details.frames)) {
      if (fdata.status === 'failed' || fdata.status === 'queued') {
        failedFrameIds.push(fid);
      }
    }

    if (failedFrameIds.length === 0) {
      return reply.status(400).send({ error: 'No failed frames to retry' });
    }

    type PlanFrame = { id: string; sceneId: string; frameIndex: number; prompt: string };
    const plan = details.plan as { frames?: PlanFrame[] } | null;
    const planFrames = plan?.frames;

    if (!planFrames || planFrames.length === 0) {
      return reply.status(400).send({ error: 'No plan found — cannot determine frame prompts' });
    }

    const referenceDir = join(config.storagePath, 'runs', runId, 'references');
    const { existsSync, readdirSync } = await import('fs');
    const hasRefs = existsSync(referenceDir);
    const referenceFiles = hasRefs
      ? readdirSync(referenceDir).filter((f: string) => !f.startsWith('.'))
      : [];

    const jobs = [];
    for (const fid of failedFrameIds) {
      const framePlan = planFrames.find((f: PlanFrame) => f.id === fid);
      if (!framePlan) continue;
      jobs.push({
        name: `frame:${fid}`,
        data: {
          runId,
          frameId: fid,
          sceneId: framePlan.sceneId,
          frameIndex: framePlan.frameIndex,
          prompt: framePlan.prompt,
          referenceDir: hasRefs ? referenceDir : undefined,
          referenceFiles: hasRefs ? referenceFiles : undefined,
        },
        opts: { jobId: `${runId}--${fid}--retry-${Date.now()}` },
      });
    }

    if (jobs.length > 0) {
      await frameQueue.addBulk(jobs);
      await resetRunForRetry(runId, jobs.length);

      emitRunEvent({
        type: 'frame_queued',
        runId,
        data: { retrying: failedFrameIds },
      });
    }

    return reply.send({ ok: true, retrying: failedFrameIds.length });
  });

  /* ── Retry a single failed / stuck frame ── */
  app.post('/api/runs/:runId/frames/:frameId/retry', async (request, reply) => {
    const { runId, frameId } = request.params as { runId: string; frameId: string };
    const details = await getRunDetails(runId);
    if (!details) return reply.status(404).send({ error: 'Run not found' });

    const prev = details.frames[frameId];
    if (!prev || (prev.status !== 'failed' && prev.status !== 'queued')) {
      return reply.status(400).send({ error: 'Frame is not in a retryable state' });
    }

    type PlanFrame = { id: string; sceneId: string; frameIndex: number; prompt: string };
    const planFrames = (details.plan as { frames?: PlanFrame[] } | null)?.frames;
    if (!planFrames?.length) {
      return reply.status(400).send({ error: 'No plan found — cannot determine frame prompt' });
    }
    const framePlan = planFrames.find((f) => f.id === frameId);
    if (!framePlan) return reply.status(400).send({ error: 'Frame not in plan' });

    const referenceDir = join(config.storagePath, 'runs', runId, 'references');
    const { existsSync, readdirSync } = await import('fs');
    const hasRefs = existsSync(referenceDir);
    const referenceFiles = hasRefs
      ? readdirSync(referenceDir).filter((f: string) => !f.startsWith('.'))
      : [];

    await saveFrameStatus(runId, frameId, 'queued', {});

    await bumpPendingForFrameRetry(runId, prev.status);

    const imageSize = details.imageSize || undefined;
    await frameQueue.add(
      `frame:${frameId}`,
      {
        runId,
        frameId,
        sceneId: framePlan.sceneId,
        frameIndex: framePlan.frameIndex,
        prompt: framePlan.prompt,
        referenceDir: hasRefs ? referenceDir : undefined,
        referenceFiles: hasRefs ? referenceFiles : undefined,
        imageSize,
      },
      { jobId: `${runId}--${frameId}--retry-${Date.now()}` },
    );

    emitRunEvent({ type: 'frame_queued', runId, data: { frameId, single: true } });

    return reply.send({ ok: true, frameId });
  });

  /* ── Delete run (Redis + storage) ── */
  app.delete('/api/runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const details = await getRunDetails(runId);
    if (!details) return reply.status(404).send({ error: 'Run not found' });

    await deleteRun(runId);
    const { rm } = await import('fs/promises');
    const dir = join(config.storagePath, 'runs', runId);
    try {
      await rm(dir, { recursive: true, force: true });
    } catch { /* ignore missing dir */ }

    return reply.send({ ok: true });
  });
  app.post('/api/runs/:runId/frames/:frameId/video', async (request, reply) => {
    const { runId, frameId } = request.params as { runId: string; frameId: string };

    const imagePath = join(config.storagePath, 'runs', runId, `${frameId}.png`);
    const { existsSync } = await import('fs');
    if (!existsSync(imagePath)) {
      return reply.status(404).send({ error: 'Frame image not found' });
    }

    const details = await getRunDetails(runId);
    if (!details) return reply.status(404).send({ error: 'Run not found' });

    const plan = details.plan as { frames?: Array<{ id: string; prompt: string }> } | null;
    const framePlan = plan?.frames?.find((f) => f.id === frameId);
    const prompt = framePlan?.prompt ?? details.prompt;

    const jobId = `${runId}--${frameId}--video-${Date.now()}`;
    await videoQueue.add('generate-video', {
      runId,
      frameId,
      prompt,
      imagePath,
    }, { jobId });

    return reply.send({ ok: true, jobId });
  });

  /* ── List runs (history) ── */
  app.get('/api/runs', async (request, reply) => {
    const q = request.query as { offset?: string; limit?: string };
    const offset = parseInt(q.offset || '0', 10);
    const limit = Math.min(parseInt(q.limit || '50', 10), 100);
    const runs = await listRuns(offset, limit);
    return reply.send({ runs });
  });

  /* ── Run details (for loading past graphs) ── */
  app.get('/api/runs/:runId/details', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const details = await getRunDetails(runId);
    if (!details) return reply.status(404).send({ error: 'Run not found' });
    return reply.send(details);
  });

  /* ── SSE stream ── */
  app.get('/api/runs/:runId/events', async (request, reply) => {
    const { runId } = request.params as { runId: string };

    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');

    const stream = new PassThrough();

    const handler = (event: RunEvent) => {
      stream.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'run_complete' || event.type === 'orchestrator_failed' || event.type === 'run_killed') {
        cleanup();
        stream.end();
      }
    };

    const heartbeat = setInterval(() => {
      stream.write(`: heartbeat\n\n`);
    }, 25_000);

    function cleanup() {
      clearInterval(heartbeat);
      runEvents.off(`run:${runId}`, handler);
    }

    runEvents.on(`run:${runId}`, handler);
    stream.write(`data: ${JSON.stringify({ type: 'connected', runId, data: {} })}\n\n`);

    request.raw.on('close', () => {
      cleanup();
      stream.end();
    });

    return reply.send(stream);
  });
}
