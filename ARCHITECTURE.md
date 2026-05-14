# NodeWow — Architecture & Functionality Directory

> **Purpose:** A complete reference of every module, its responsibility, data flow, and how components connect.
> Updated whenever functionality is added or changed.

---

## System Overview

```
┌─────────────┐     POST /api/runs      ┌──────────────────┐
│   Frontend   │ ──────────────────────▶ │    Backend API    │
│  (Next.js)   │                         │    (Fastify)      │
│              │ ◀─── SSE events ─────── │                   │
│  React Flow  │                         │  ┌──────────────┐ │
│  ELK Layout  │                         │  │ Orchestrator │ │
│  Custom Nodes│                         │  │   Worker     │ │
└─────────────┘                         │  └──────┬───────┘ │
                                        │         │ enqueue  │
                                        │  ┌──────▼───────┐ │
                                        │  │  Frame Gen   │ │
                                        │  │  Workers (N) │ │
                                        │  └──────────────┘ │
                                        │         │         │
                                        │  ┌──────▼───────┐ │
                                        │  │    Redis     │ │
                                        │  │  (BullMQ)    │ │
                                        │  └──────────────┘ │
                                        └──────────────────┘
                                               │
                                        ┌──────▼───────┐
                                        │  Gemini API  │
                                        │  (text+image)│
                                        └──────────────┘
```

---

## Data Flow (per run)

1. **User** types a collated multi-scene prompt in the frontend textarea.
2. **Frontend** sends `POST /api/runs { collatedPrompt }` → backend returns `{ runId }`.
3. **Frontend** opens `EventSource` to `GET /api/runs/:runId/events`.
4. **Backend** enqueues a job on the `orchestrate` BullMQ queue.
5. **Orchestrator worker** picks the job:
   - Calls Gemini text model (`gemini-2.5-flash`) with a structured system prompt.
   - Parses + Zod-validates the JSON plan (scenes + frames).
   - Calls `initRun(runId, totalFrames)` to set Redis counters.
   - Emits `plan_ready` SSE event with the full plan.
   - Enqueues N frame jobs on `generate-frame` queue with deterministic job IDs.
   - Emits `frame_queued` per frame.
6. **Frame workers** (configurable concurrency, default 5) pick jobs in parallel:
   - Emit `frame_started`.
   - Call Gemini image API (`imagen-4.0-generate-001`, 16:9 aspect).
   - Save PNG to `backend/storage/runs/{runId}/{frameId}.png`.
   - Emit `frame_done` with asset URL.
   - Atomically decrement Redis pending counter; emit `run_complete` when zero.
   - On failure after all retries: emit `frame_failed` + decrement counter.
7. **Frontend** processes each SSE event:
   - `plan_ready` → builds full node graph, runs ELK layout, fits view.
   - `frame_started` → sets node status to "generating" (orange pulse).
   - `frame_done` → sets node status to "complete" (emerald), shows thumbnail.
   - `frame_failed` → sets node status to "failed" (red).
   - `run_complete` → sets global status to "complete".

---

## Module Directory

### Backend

| Module | File | Responsibility |
|--------|------|----------------|
| **Config** | `src/config.ts` | Loads env vars from `../../.env`, exports typed config object |
| **Schema** | `src/schema.ts` | Zod schemas for `Plan`, `Scene`, `Frame`, `RunRequest` |
| **SSE** | `src/sse.ts` | Shared `EventEmitter`; `emitRunEvent()` broadcasts to run-scoped listeners |
| **Gemini** | `src/gemini.ts` | `orchestrate()` — text model → JSON plan; `generateFrameImage()` — image model → Buffer; `friendlyError()` — error message extraction |
| **Queues** | `src/queues.ts` | BullMQ `orchestrate` and `generate-frame` queue instances with retry/backoff config |
| **Run Tracker** | `src/runTracker.ts` | Full run lifecycle: `createRun`, `initRun`, `savePlan`, `saveFrameStatus`, `markRunFailed`, `listRuns`, `getRunDetails`; Redis hash + sorted set indexing + atomic DECR for completion |
| **Orchestrator Worker** | `src/workers/orchestrator.ts` | Level 1: plan → validate → fan-out |
| **Frame Gen Worker** | `src/workers/frameGen.ts` | Level 2: image gen → disk persist → completion tracking |
| **Runs Route** | `src/routes/runs.ts` | `POST /api/runs` (create), `GET /api/runs` (list history), `GET /api/runs/:runId/details` (full run detail), `GET /api/runs/:runId/events` (SSE) |
| **Assets Route** | `src/routes/assets.ts` | Static PNG serving with path sanitisation |
| **Entry** | `src/index.ts` | Fastify server, CORS, route registration, worker startup, graceful shutdown |

### Frontend

| Module | File | Responsibility |
|--------|------|----------------|
| **Page** | `src/app/page.tsx` | Wraps FlowCanvas in ReactFlowProvider (new generation mode) |
| **History Page** | `src/app/history/page.tsx` | Selection page listing all past runs with thumbnails, timestamps, status, prompt preview |
| **Run Viewer** | `src/app/run/[runId]/page.tsx` | Dynamic route — loads past run's graph into FlowCanvas via `loadRunId` prop |
| **Layout** | `src/app/layout.tsx` | Root HTML, dark class, font-body |
| **Styles** | `src/app/globals.css` | CSS variables, Google Fonts, scrollbar, React Flow overrides |
| **FlowCanvas** | `src/components/flow/FlowCanvas.tsx` | Main component: state machine, SSE, node/edge management, ELK layout, history loading via `loadRunId` prop, graph reconstruction from stored plan+frames |
| **CollatedPromptNode** | `src/components/flow/CollatedPromptNode.tsx` | Input prompt display node |
| **OrchestratorNode** | `src/components/flow/OrchestratorNode.tsx` | Scene analyzer node (analyzing/complete/failed) |
| **SceneGroupNode** | `src/components/flow/SceneGroupNode.tsx` | Scene header node |
| **FrameNode** | `src/components/flow/FrameNode.tsx` | Frame card with thumbnail, status, prompt |
| **Button** | `src/components/ui/Button.tsx` | JewelAI-style button component |
| **StatusBadge** | `src/components/ui/StatusBadge.tsx` | Status pill component |
| **Layout Engine** | `src/lib/layout.ts` | ELK graph layout wrapper |
| **Utils** | `src/lib/utils.ts` | `cn()` class merger |

### Infrastructure

| File | Responsibility |
|------|----------------|
| `docker-compose.yml` | Redis 7 service with AOF + healthcheck |
| `.env` / `.env.example` | Environment variables (API keys, model IDs, tuning) |
| `README.md` | Quick start and reference |
| `CHANGELOG.md` | Chronological change log |
| `ARCHITECTURE.md` | This file — full system reference |
| `JewelAI_Design_System.md` | UI design tokens and patterns reference |

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Run persistence in Redis** | Every run's prompt, plan, frame statuses, and timestamps are stored in Redis hashes; indexed in a sorted set for O(log N) time-ordered listing |
| **BullMQ over direct async** | Durable queues with retry, backoff, concurrency caps, and deterministic job IDs for idempotency |
| **SSE over WebSocket** | One-way server→client; simpler, no library needed on client (`EventSource` is native) |
| **ELK layout** | Layered algorithm handles fan-out graphs cleanly; runs once on `plan_ready` |
| **Redis atomic DECR for completion** | Race-free tracking of N parallel frame workers without distributed locks |
| **Deterministic job IDs** | `${runId}:${frameId}` prevents duplicate jobs on retry |
| **Error extraction** | `friendlyError()` parses Gemini JSON errors to show readable messages in UI |
| **Separate queues** | Orchestrate (concurrency 1) vs frame-gen (concurrency N) — different throughput needs |

---

## SSE Event Contract

| Event | Payload | When |
|-------|---------|------|
| `connected` | `{ runId }` | SSE stream opened |
| `plan_ready` | `{ plan: { totalFrames, scenes[], frames[] } }` | Orchestrator finished |
| `frame_queued` | `{ frameId, sceneId }` | Frame job enqueued |
| `frame_started` | `{ frameId }` | Frame worker picked up job |
| `frame_done` | `{ frameId, assetUrl }` | Image generated + saved |
| `frame_failed` | `{ frameId, error }` | Frame generation failed |
| `run_complete` | `{ completed, failed, total }` | All frames resolved |
| `orchestrator_failed` | `{ error }` | Planning step failed |

---

## Node Types (React Flow)

| Type | ID Pattern | Source Handle | Target Handle | Data Shape |
|------|-----------|---------------|---------------|------------|
| `collatedPrompt` | `input` | Bottom | — | `{ prompt: string }` |
| `orchestrator` | `orchestrator` | Bottom | Top | `{ status, sceneCount?, frameCount?, error? }` |
| `sceneGroup` | `scene-{n}` | Bottom | Top | `{ title, summary }` |
| `frame` | `frame-{n}` | — | Top | `{ status, prompt, frameIndex, assetUrl?, error? }` |

---

## Redis Data Model

| Key | Type | Fields |
|-----|------|--------|
| `runs:all` | Sorted Set | Score = creation timestamp, member = runId |
| `run:{id}` | Hash | `prompt`, `status`, `total`, `completed`, `failed`, `createdAt`, `completedAt`, `plan` (JSON) |
| `run:{id}:frames` | Hash | Key = frameId, value = JSON `{ status, assetUrl?, error? }` |
| `run:{id}:pending` | String | Atomic counter decremented by workers for completion detection |

---

*Updated: 2026-05-14 04:22 IST*
