# NodeWow — Two-Level LLM Scene Orchestrator

A node-based visual pipeline that uses **Gemini** for two-level LLM orchestration:

1. **Level 1 (Orchestrator)** — Analyzes a collated multi-scene prompt and decomposes it into individual scenes and frame-level image prompts.
2. **Level 2 (Parallel Workers)** — Generates every frame image **in parallel** using Gemini's image generation API (Imagen), with BullMQ + Redis for durable job queuing.

The **React Flow** frontend materializes the pipeline as an auto-laid-out node graph that updates in real time via SSE.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| Docker (for Redis) | Any recent |
| Gemini API key | [Get one at AI Studio](https://aistudio.google.com/apikey) |

## Quick Start

```bash
# 1. Start Redis
docker compose up -d

# 2. Install + start the backend
cd backend
npm install
npm run dev          # http://localhost:3001

# 3. In a separate terminal — install + start the frontend
cd frontend
npm install
npm run dev          # http://localhost:3000
```

Open **http://localhost:3000**, type a multi-scene prompt, and click **Generate Frames**. The graph builds itself in real time.

## Environment Variables

Copy `.env.example` to `.env` at the repo root and fill in `GEMINI_API_KEY`. Key tunables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `GEMINI_API_KEY` | — | Required. Your Google AI Studio key |
| `REDIS_URL` | `redis://localhost:6379` | BullMQ connection |
| `ORCHESTRATOR_MODEL` | `gemini-2.5-flash` | Text model for scene planning |
| `IMAGE_MODEL` | `imagen-4.0-generate-001` | Image generation model |
| `FRAME_QUEUE_CONCURRENCY` | `5` | Max parallel image generation jobs |
| `PORT` | `3001` | Backend HTTP port |

## Architecture

```
User prompt
  │
  ▼
POST /api/runs ──▶ BullMQ "orchestrate" queue
                       │
                       ▼
                   Gemini text model → JSON plan (scenes + frames)
                       │
                       ▼
               BullMQ "generate-frame" queue (N jobs, parallel)
                    │  │  │
                    ▼  ▼  ▼
               Gemini image API (one call per frame)
                    │  │  │
                    ▼  ▼  ▼
               SSE events → React Flow graph
```

## Image Resolution

The image generation model produces frames at its native maximum resolution (up to ~1536×2048 for 16:9). True 4K (3840×2160) depends on model capabilities — the API is configured to request the largest output the model supports. No client-side upscaling is applied.

## Project Structure

```
backend/
  src/
    config.ts         — env + defaults
    schema.ts         — Zod schemas for plan / run request
    gemini.ts         — Gemini text + image wrappers
    queues.ts         — BullMQ queue definitions
    runTracker.ts     — Redis-backed completion tracker
    sse.ts            — EventEmitter for run events
    workers/
      orchestrator.ts — Level 1: plan + fan-out
      frameGen.ts     — Level 2: image gen + disk persist
    routes/
      runs.ts         — POST /api/runs + GET SSE stream
      assets.ts       — Static image serving
    index.ts          — Fastify entry

frontend/
  src/
    app/              — Next.js App Router
    components/
      flow/           — Custom React Flow nodes + canvas
      ui/             — Button, StatusBadge
    lib/
      layout.ts       — ELK auto-layout
      utils.ts        — cn() utility
```
