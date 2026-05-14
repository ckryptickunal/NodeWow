import { createReadStream, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';
import { ZipFile } from 'yazl';
import { config } from '../config.js';

export async function assetsRoutes(app: FastifyInstance) {
  app.get('/api/assets/runs/:runId/:filename', async (request, reply) => {
    const { runId, filename } = request.params as {
      runId: string;
      filename: string;
    };

    if (runId.includes('..') || filename.includes('..')) {
      return reply.status(400).send({ error: 'Invalid path' });
    }

    const filePath = join(config.storagePath, 'runs', runId, filename);

    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: 'Not found' });
    }

    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(createReadStream(filePath));
  });

  app.get('/api/runs/:runId/download', async (request, reply) => {
    const { runId } = request.params as { runId: string };

    if (runId.includes('..')) {
      return reply.status(400).send({ error: 'Invalid path' });
    }

    const runDir = join(config.storagePath, 'runs', runId);
    if (!existsSync(runDir)) {
      return reply.status(404).send({ error: 'Run not found' });
    }

    const files = readdirSync(runDir).filter(
      (f) => f.endsWith('.png') && !f.endsWith('-thumb.png'),
    );

    if (files.length === 0) {
      return reply.status(404).send({ error: 'No images found for this run' });
    }

    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="nodewow-${runId.slice(0, 8)}.zip"`);

    const zip = new ZipFile();
    for (const file of files) {
      zip.addFile(join(runDir, file), file);
    }
    zip.end();

    return reply.send(zip.outputStream);
  });
}
