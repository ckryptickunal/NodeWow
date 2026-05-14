import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { runsRoutes } from './routes/runs.js';
import { assetsRoutes } from './routes/assets.js';
import { startOrchestratorWorker } from './workers/orchestrator.js';
import { startFrameGenWorker } from './workers/frameGen.js';
import { reconcileStuckRuns } from './runTracker.js';

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: [config.frontendUrl, 'http://localhost:3000'],
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  });

  await app.register(runsRoutes);
  await app.register(assetsRoutes);

  app.get('/api/health', async () => ({ status: 'ok', ts: Date.now() }));

  const orchestratorWorker = startOrchestratorWorker();
  const frameGenWorker = startFrameGenWorker();
  console.log(`[workers] Started (frame concurrency: ${config.frameQueueConcurrency})`);

  const shutdown = async () => {
    console.log('Shutting down…');
    await orchestratorWorker.close();
    await frameGenWorker.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({ port: config.port, host: config.host });
  console.log(`Server → http://localhost:${config.port}`);

  reconcileStuckRuns().catch((err) =>
    console.warn('[reconcile] Failed to reconcile stuck runs:', err.message),
  );
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
