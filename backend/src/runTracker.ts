import Redis from 'ioredis';
import { config } from './config.js';
import { emitRunEvent } from './sse.js';

const redis = new Redis(config.redisUrl);

/* ── Create ── */

export async function createRun(runId: string, prompt: string, imageSize?: string) {
  const now = new Date().toISOString();
  const fields: Record<string, string> = {
    prompt,
    status: 'orchestrating',
    total: '0',
    completed: '0',
    failed: '0',
    createdAt: now,
  };
  if (imageSize) fields.imageSize = imageSize;
  await redis.hset(`run:${runId}`, fields);
  await redis.zadd('runs:all', Date.now().toString(), runId);
}

export async function initRun(runId: string, totalFrames: number) {
  await redis.hset(`run:${runId}`, {
    total: totalFrames.toString(),
    status: 'generating',
  });
  await redis.set(`run:${runId}:pending`, totalFrames.toString());
}

export async function savePlan(runId: string, plan: object) {
  await redis.hset(`run:${runId}`, 'plan', JSON.stringify(plan));
}

/* ── Frame tracking ── */

export async function saveFrameStatus(
  runId: string,
  frameId: string,
  status: string,
  extra: Record<string, string> = {},
) {
  await redis.hset(
    `run:${runId}:frames`,
    frameId,
    JSON.stringify({ status, ...extra }),
  );
}

export async function markFrameCompleted(runId: string) {
  await redis.hincrby(`run:${runId}`, 'completed', 1);
  return checkCompletion(runId);
}

export async function markFramePermanentlyFailed(runId: string) {
  await redis.hincrby(`run:${runId}`, 'failed', 1);
  return checkCompletion(runId);
}

export async function markRunFailed(runId: string) {
  await redis.hset(`run:${runId}`, 'status', 'failed');
}

export async function markRunKilled(runId: string) {
  const now = new Date().toISOString();
  await redis.hset(`run:${runId}`, { status: 'killed', completedAt: now });
}

export async function resetRunForRetry(runId: string, retryCount: number) {
  await redis.hset(`run:${runId}`, {
    status: 'generating',
    completedAt: '',
  });
  await redis.set(`run:${runId}:pending`, retryCount.toString());
}

async function checkCompletion(runId: string) {
  const remaining = await redis.decr(`run:${runId}:pending`);
  if (remaining <= 0) {
    const now = new Date().toISOString();
    await redis.hset(`run:${runId}`, { status: 'complete', completedAt: now });
    const meta = await redis.hgetall(`run:${runId}`);
    emitRunEvent({
      type: 'run_complete',
      runId,
      data: {
        completed: parseInt(meta.completed || '0', 10),
        failed: parseInt(meta.failed || '0', 10),
        total: parseInt(meta.total || '0', 10),
      },
    });
    return true;
  }
  return false;
}

/* ── Startup reconciliation: fix runs stuck in generating/orchestrating ── */

export async function reconcileStuckRuns() {
  const allIds = await redis.zrevrange('runs:all', 0, 200);
  let fixed = 0;

  for (const runId of allIds) {
    const meta = await redis.hgetall(`run:${runId}`);
    if (meta.status !== 'generating' && meta.status !== 'orchestrating') continue;

    const total = parseInt(meta.total || '0', 10);
    if (total === 0 && meta.status === 'orchestrating') {
      const age = Date.now() - new Date(meta.createdAt).getTime();
      if (age > 5 * 60 * 1000) {
        await redis.hset(`run:${runId}`, { status: 'failed', completedAt: new Date().toISOString() });
        fixed++;
      }
      continue;
    }

    const frameRaw = await redis.hgetall(`run:${runId}:frames`);
    let completed = 0;
    let failed = 0;
    for (const val of Object.values(frameRaw)) {
      try {
        const f = JSON.parse(val);
        if (f.status === 'complete') completed++;
        else if (f.status === 'failed') failed++;
      } catch { /* skip */ }
    }

    if (completed + failed >= total && total > 0) {
      const now = new Date().toISOString();
      const finalStatus = failed > 0 && completed === 0 ? 'failed' : 'complete';
      await redis.hset(`run:${runId}`, {
        status: finalStatus,
        completed: completed.toString(),
        failed: failed.toString(),
        completedAt: now,
      });
      fixed++;
    }
  }

  if (fixed > 0) console.log(`[reconcile] Fixed ${fixed} stuck run(s)`);
}

/* ── Video tracking ── */

export async function saveVideoStatus(
  runId: string,
  frameId: string,
  status: string,
  extra: Record<string, string> = {},
) {
  await redis.hset(
    `run:${runId}:videos`,
    frameId,
    JSON.stringify({ status, ...extra }),
  );
}

export async function reconcileStuckVideos() {
  const allIds = await redis.zrevrange('runs:all', 0, 200);
  let fixed = 0;

  for (const runId of allIds) {
    const videoRaw = await redis.hgetall(`run:${runId}:videos`);
    for (const [frameId, val] of Object.entries(videoRaw)) {
      try {
        const v = JSON.parse(val);
        if (v.status === 'generating') {
          await redis.hset(
            `run:${runId}:videos`,
            frameId,
            JSON.stringify({ ...v, status: 'failed', error: 'Interrupted — server restarted' }),
          );
          fixed++;
        }
      } catch { /* skip */ }
    }
  }

  if (fixed > 0) console.log(`[reconcile] Fixed ${fixed} stuck video(s)`);
}

/* ── Queries ── */

export async function listRuns(offset = 0, limit = 50) {
  const ids = await redis.zrevrange('runs:all', offset, offset + limit - 1);

  return Promise.all(
    ids.map(async (runId) => {
      const meta = await redis.hgetall(`run:${runId}`);
      const frameRaw = await redis.hgetall(`run:${runId}:frames`);

      const thumbnails: string[] = [];
      for (const val of Object.values(frameRaw)) {
        try {
          const f = JSON.parse(val);
          if (f.status === 'complete' && f.assetUrl) thumbnails.push(f.assetUrl);
        } catch { /* skip */ }
      }

      return {
        runId,
        prompt: meta.prompt ?? '',
        status: meta.status ?? 'unknown',
        total: parseInt(meta.total || '0', 10),
        completed: parseInt(meta.completed || '0', 10),
        failed: parseInt(meta.failed || '0', 10),
        createdAt: meta.createdAt ?? '',
        completedAt: meta.completedAt ?? null,
        thumbnails,
      };
    }),
  );
}

export async function getRunDetails(runId: string) {
  const meta = await redis.hgetall(`run:${runId}`);
  if (!meta.prompt) return null;

  const frameRaw = await redis.hgetall(`run:${runId}:frames`);
  const frames: Record<string, { status: string; assetUrl?: string; thumbUrl?: string; error?: string }> = {};
  for (const [fid, val] of Object.entries(frameRaw)) {
    try { frames[fid] = JSON.parse(val); } catch { frames[fid] = { status: 'unknown' }; }
  }

  const videoRaw = await redis.hgetall(`run:${runId}:videos`);
  const videos: Record<string, { status: string; videoUrl?: string; motionPrompt?: string; error?: string }> = {};
  for (const [fid, val] of Object.entries(videoRaw)) {
    try { videos[fid] = JSON.parse(val); } catch { /* skip */ }
  }

  let plan: object | null = null;
  try { if (meta.plan) plan = JSON.parse(meta.plan); } catch { /* skip */ }

  return {
    runId,
    prompt: meta.prompt,
    status: meta.status ?? 'unknown',
    total: parseInt(meta.total || '0', 10),
    completed: parseInt(meta.completed || '0', 10),
    failed: parseInt(meta.failed || '0', 10),
    createdAt: meta.createdAt ?? '',
    completedAt: meta.completedAt ?? null,
    imageSize: meta.imageSize ?? '',
    plan,
    frames,
    videos,
  };
}

export async function deleteRun(runId: string) {
  const pipeline = redis.pipeline();
  pipeline.del(`run:${runId}`);
  pipeline.del(`run:${runId}:frames`);
  pipeline.del(`run:${runId}:videos`);
  pipeline.del(`run:${runId}:pending`);
  pipeline.zrem('runs:all', runId);
  await pipeline.exec();
}

/** Re-open run bookkeeping when retrying one frame (after run may have completed). */
export async function bumpPendingForFrameRetry(runId: string, previousFrameStatus: string) {
  const meta = await redis.hgetall(`run:${runId}`);
  await redis.incr(`run:${runId}:pending`);
  if (previousFrameStatus === 'failed') {
    const failed = parseInt(meta.failed || '0', 10);
    if (failed > 0) await redis.hincrby(`run:${runId}`, 'failed', -1);
  }
  const runStatus = meta.status ?? '';
  if (runStatus === 'complete' || runStatus === 'killed' || runStatus === 'failed') {
    await redis.hset(`run:${runId}`, { status: 'generating', completedAt: '' });
  }
}
