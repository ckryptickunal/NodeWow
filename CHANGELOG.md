# NodeWow — Change Log

> **Purpose:** A complete, chronological record of every change made to the project.
> Every entry includes a timestamp, what changed, why, and which files were touched.
> Maintained so any team member (or LLM agent) can pick up context instantly.

---

## 2026-05-14 06:57 IST — Overhaul motion prompt agent for realism

**What:** Replaced the generic motion agent system prompt with a physics-aware cinematography directive. The old prompt produced identical cookie-cutter results ("slow dolly-in + dust motes + gentle breathing" for every scene). The new prompt forces the model to: (1) simulate physics first — what materials, forces, and scale exist in the scene, (2) avoid clichés (dust motes, generic dolly-in, filler adjectives like "subtle/gentle"), (3) choose camera motion motivated by the actual scene content instead of a formula, (4) describe 2-3 physically specific motions with named objects, causal forces, and approximate amplitudes, (5) match energy to the scene type. Also switched to using `systemInstruction` config for proper system/user separation, raised temperature to 0.9 for variety, and added a step-by-step reasoning prompt to the user message.

**Files changed:**
- `backend/src/gemini.ts` — Rewrote `MOTION_AGENT_SYSTEM` prompt; updated `generateMotionPrompt()` to use `config.systemInstruction` and `temperature: 0.9`

---

## 2026-05-14 06:54 IST — Fix video nodes not showing consistently

**What:** Fixed React Flow edge connection failures that caused some video nodes to not render. Root cause: frame nodes had both target (top) and source (bottom) Handles without explicit IDs, making React Flow's handle matching non-deterministic. Also removed redundant "Video" badge and "Play" button from frame nodes (now handled by dedicated video nodes), fixed stuck `generating` videos via a startup reconciliation that marks them as `failed`, and added explicit `sourceHandle`/`targetHandle` to all video edges.

**Files changed:**
- `frontend/src/components/flow/FrameNode.tsx` — Added explicit Handle `id` props (`target-top`, `source-video`); removed redundant video badge, play button, and `handlePlayVideo` callback
- `frontend/src/components/flow/VideoNode.tsx` — Added explicit Handle `id` prop (`target-top`)
- `frontend/src/components/flow/FlowCanvas.tsx` — Updated `buildEdges` and SSE handler video edges to use `sourceHandle: 'source-video'` and `targetHandle: 'target-top'`; updated scene→frame edges with `targetHandle: 'target-top'`
- `backend/src/runTracker.ts` — Added `reconcileStuckVideos()` to mark abandoned `generating` videos as `failed` on startup
- `backend/src/index.ts` — Call `reconcileStuckVideos()` during server startup

---

## 2026-05-14 06:15 IST — Video generation from images (Veo 3.1)

**What:** Added image-to-video generation using Google Veo 3.1. A "Generate Video" button now appears on all completed frame nodes. When clicked, a motion agent (using the orchestrator LLM) analyzes the original image prompt and generates an appropriate cinematic motion directive. That motion prompt is then combined with the source image to generate a 5-8 second video via Veo 3.1's image-to-video API. Videos are displayed in a dedicated player modal.

**Files changed:**
- `backend/src/config.ts` — Added `videoModel` config (`veo-3.1-generate-preview`)
- `backend/src/gemini.ts` — Added `generateMotionPrompt()` (motion agent) and `generateVideo()` (Veo 3.1 image-to-video with polling)
- `backend/src/queues.ts` — Added `videoQueue` BullMQ queue
- `backend/src/workers/videoGen.ts` — **New file**: Video generation worker with motion prompt → video pipeline
- `backend/src/sse.ts` — Added video SSE event types: `video_started`, `video_motion_ready`, `video_done`, `video_failed`
- `backend/src/routes/runs.ts` — Added `POST /api/runs/:runId/frames/:frameId/video` endpoint
- `backend/src/routes/assets.ts` — Extended MIME type handling for `.mp4` video serving
- `backend/src/index.ts` — Registered video worker
- `frontend/src/components/flow/FrameNode.tsx` — Added video UI: generate button, generating spinner badge, play badge, play button
- `frontend/src/components/flow/FlowCanvas.tsx` — Added video SSE handlers, generate-video/play-video event listeners, video player modal
- `.env.example` — Documented `VIDEO_MODEL` config

---

## 2026-05-14 05:42 IST — Input node controls & Retry failed button

**What:** Added prompt-view and kill-switch buttons directly on the INPUT PROMPT node, and a "Retry Failed" button in the status bar for failed/killed runs that re-queues only the failed frames.

**Backend changes:**
- `backend/src/routes/runs.ts` — Added `POST /api/runs/:runId/retry` endpoint: finds failed/queued frames in a run, looks up their prompts from the saved plan, re-queues them as new BullMQ jobs, and resets run to `generating`
- `backend/src/runTracker.ts` — Added `resetRunForRetry()` to set run status back to `generating` and reset the pending counter

**Frontend changes:**
- `frontend/src/components/flow/CollatedPromptNode.tsx` — Redesigned to include: (1) expand icon button to view the full prompt in the modal, (2) red octagon-X kill switch button that dispatches `nodewow:kill-run` event (visible only during orchestrating/generating)
- `frontend/src/components/flow/FlowCanvas.tsx` — Added `handleRetry` that calls POST `/api/runs/:runId/retry` and re-subscribes to SSE; added `nodewow:kill-run` listener to forward kill from input node; added `useEffect` to sync run status to input node data; added "Retry Failed" button (orange RefreshCw icon) in status bar for failed/killed states

---

## 2026-05-14 05:35 IST — Download All (ZIP) & History thumbnail limit

**What:** Added a "Download All" button that packages all generated full-resolution images from a run into a ZIP file for one-click download. Also limited history page thumbnails to 2 visible images + a "+X" counter badge for scalability.

**Backend changes:**
- `backend/src/routes/assets.ts` — Added `GET /api/runs/:runId/download` endpoint using `yazl` to stream a ZIP of all full-res PNGs (excluding thumbnails)
- `backend/package.json` — Added `yazl` + `@types/yazl`, removed `archiver`

**Frontend changes:**
- `frontend/src/components/flow/FlowCanvas.tsx` — Added "Download All" button in status bar (visible when status is `complete` or `killed` and images exist), triggers ZIP download via anchor element
- `frontend/src/app/history/page.tsx` — Reduced thumbnail strip from 4 to 2 visible images; added "+X" count badge when more than 2 images exist

---

## 2026-05-14 05:25 IST — Force Kill button & Full Prompt Viewer

**What:** Added two UX features: (1) a "Stop" button that immediately kills all queued/active frame generation jobs for the current run, and (2) a "View full prompt" button on each frame node that opens a modal showing the complete prompt injected into the image generation agent.

**Why:** Allows users to save API credits by stopping generation mid-run, and gives full transparency into what prompt was actually sent to the model.

**Backend changes:**
- `backend/src/routes/runs.ts` — Added `POST /api/runs/:runId/kill` endpoint that removes queued jobs, fails active jobs, marks run as killed, and emits `run_killed` SSE event
- `backend/src/runTracker.ts` — Added `markRunKilled()` function
- `backend/src/sse.ts` — Added `run_killed` event type

**Frontend changes:**
- `frontend/src/components/flow/FlowCanvas.tsx` — Added `killed` status, kill handler, "Stop" button (red OctagonX icon) in status bar during orchestrating/generating, prompt viewer modal with copy-to-clipboard, `nodewow:view-prompt` event listener
- `frontend/src/components/flow/FrameNode.tsx` — Added FileText icon button next to frame title that dispatches `nodewow:view-prompt` custom event with the frame's full prompt

---

## 2026-05-14 05:10 IST — Reference image injection for image generation

**What changed:**
- **Backend multipart upload** — Installed `@fastify/multipart`; `POST /api/runs` now accepts `multipart/form-data` with `collatedPrompt` text field and `references` file fields (up to 10 images, 20MB each). Falls back to JSON body when no files are present. Reference images are saved to `storage/runs/{runId}/references/`.
- **Gemini API integration** — `generateFrameImage()` now accepts an array of `ReferenceImage` objects (base64 + mimeType). When references are present, they're injected as `inlineData` parts alongside the text prompt with style-matching instructions. Every frame in the run receives the same reference images.
- **Worker pipeline** — Orchestrator worker passes `referenceDir` and `referenceFiles` through to frame generation jobs. Frame worker loads reference images from disk, converts to base64, and passes to Gemini.
- **Frontend upload UI** — Drag-and-drop zone + file picker between textarea and Generate button. Shows thumbnail previews (64×64) with hover-to-remove buttons. Accepts up to 10 images. Text label updates dynamically ("2 references — add more"). FormData submission when references are present; JSON otherwise. References cleared on reset.
- **Lightbox fix** — Fixed wrong-image-opening bug: matching now uses `assetUrl` (unique) instead of synthesized frame IDs. Added stable sort tiebreaker by node ID.
- **Orchestrator prompt** — Rewritten to preserve verbose user prompts verbatim and intelligently detect scene boundaries in any format.

**Files touched:**
- `backend/package.json` — added `@fastify/multipart`
- `backend/src/index.ts` — registered multipart plugin
- `backend/src/routes/runs.ts` — multipart parsing, reference file storage
- `backend/src/gemini.ts` — `ReferenceImage` interface, multi-part content injection
- `backend/src/workers/orchestrator.ts` — passes referenceDir/referenceFiles to frame jobs
- `backend/src/workers/frameGen.ts` — loads references from disk, passes to generateFrameImage
- `frontend/src/components/flow/FlowCanvas.tsx` — ref file state, upload UI, FormData submit, lightbox assetUrl match
- `frontend/src/components/flow/FrameNode.tsx` — uses node `id` prop for lightbox event

---

## 2026-05-14 04:38 IST — UX overhaul: thumbnails, lightbox, polished frame nodes

**What changed:**
- **Server-side thumbnails** — `sharp` added to backend; every generated image now gets a 480px-wide thumbnail (`{frameId}-thumb.png`) saved alongside the full 4K image. Both URLs are emitted via SSE and persisted in Redis.
- **Image lightbox** — New `ImageLightbox.tsx` component: full-screen dark overlay with backdrop blur, 4K image display with blur-up loading (thumbnail shown first), prev/next navigation (buttons + arrow keys), zoom (double-click / +/- keys / buttons, up to 5x with pan-to-drag), 4K download button, Esc to close, counter badge ("1 / 4"), prompt text card at bottom.
- **FrameNode redesign** — Skeleton shimmer animation while queued, pulse glow while generating, thumbnail display with fade-in on load, hover overlay with "View" badge + magnifying glass, pointer cursor on completed images, error text for failed frames.
- **Event-driven lightbox wiring** — FrameNode dispatches `nodewow:view-image` custom DOM event; FlowCanvas listens and opens lightbox with all completed frames for navigation, sorted by frame index.
- **CSS additions** — `@keyframes shimmer` and `.animate-in` fade added to `globals.css`.
- **Layout update** — Frame node dimensions updated in ELK layout config (240×310).

**Files touched:**
- `backend/package.json` — added `sharp` dependency
- `backend/src/workers/frameGen.ts` — thumbnail generation with sharp
- `frontend/src/components/ui/ImageLightbox.tsx` — new file
- `frontend/src/components/flow/FrameNode.tsx` — full redesign
- `frontend/src/components/flow/FlowCanvas.tsx` — lightbox state, event listener, thumbUrl propagation
- `frontend/src/app/globals.css` — shimmer/fade-in keyframes
- `frontend/src/lib/layout.ts` — updated frame node dimensions

---

## 2026-05-14 04:30 IST — Switch image model to Nano Banana Pro

### What
Replaced Imagen (`imagen-4.0-generate-001`) with Nano Banana Pro (`gemini-3-pro-image-preview`) for image generation.

### Why
User requested Nano Banana Pro, Google's professional-grade image generation model with thinking/reasoning, up to 4K resolution, advanced text rendering, and high-fidelity output.

### Technical change
Nano Banana Pro uses `generateContent` (not `generateImages`) with `responseModalities: ['IMAGE']` and `imageConfig: { aspectRatio, imageSize }`. The response returns inline base64 image data in `response.candidates[0].content.parts` rather than a dedicated `generatedImages` array.

### Files changed
| File | Change |
|------|--------|
| `backend/src/config.ts` | Default `imageModel` changed to `gemini-3-pro-image-preview`; added `imageSize` (default `4K`) and `imageAspectRatio` (default `16:9`) config |
| `backend/src/gemini.ts` | Rewrote `generateFrameImage()` from `ai.models.generateImages()` to `ai.models.generateContent()` with `responseModalities: ['IMAGE']` and `imageConfig`; extracts image from `inlineData.data` |
| `.env` | Updated `IMAGE_MODEL` to `gemini-3-pro-image-preview` |
| `.env.example` | Updated model default + added `IMAGE_SIZE` and `IMAGE_ASPECT_RATIO` vars |

### Result
End-to-end verified: frames now generated at 4K resolution via Nano Banana Pro with rich cinematic quality.

---

## 2026-05-14 04:22 IST — Job history & flow retention

### What
Added full run persistence and a history UI so users can revisit any past generation.

### Why
Users need to browse previous jobs — see thumbnails, status, timestamps — and reload the full pipeline graph for any past run without re-running it.

### Backend changes
| File | Change |
|------|--------|
| `backend/src/runTracker.ts` | Added `createRun()`, `savePlan()`, `saveFrameStatus()`, `markRunFailed()`, `listRuns()`, `getRunDetails()`. Runs are indexed in a Redis sorted set (`runs:all`) by timestamp. Each frame's final status/asset is stored in a per-run hash (`run:{id}:frames`). |
| `backend/src/routes/runs.ts` | Added `GET /api/runs` (list history with thumbnails) and `GET /api/runs/:runId/details` (full plan + frame states for graph reconstruction). Updated `POST /api/runs` to call `createRun()` before enqueueing. |
| `backend/src/workers/orchestrator.ts` | Calls `savePlan()` after successful orchestration; calls `markRunFailed()` on error. |
| `backend/src/workers/frameGen.ts` | Calls `saveFrameStatus()` with `complete`/`failed` + asset URL or error message. |

### Frontend changes
| File | Change |
|------|--------|
| `frontend/src/app/history/page.tsx` | **New** — Selection page listing all past runs with thumbnail strip (up to 4), prompt preview, date/time, frame stats, duration, and status badge. Cards link to `/run/{runId}`. |
| `frontend/src/app/run/[runId]/page.tsx` | **New** — Dynamic route that renders FlowCanvas in "view" mode, reconstructing the graph from stored data. |
| `frontend/src/components/flow/FlowCanvas.tsx` | Added `loadRunId` prop and `loadPreviousRun()` function that fetches `/api/runs/:runId/details`, builds graph from plan + frame overrides, runs ELK layout, and reconnects to SSE if run is still in progress. Added History link in header. Extracted `buildNodes()` and `buildEdges()` helpers. |

### New routes
| Route | Description |
|-------|-------------|
| `GET /api/runs` | List all runs (sorted newest-first), each with prompt, status, counts, timestamps, thumbnails |
| `GET /api/runs/:runId/details` | Full run detail: plan object + per-frame statuses/assets for graph reconstruction |
| `/history` (frontend) | History selection page |
| `/run/[runId]` (frontend) | Past run graph viewer |

### Redis data model additions
| Key | Type | Description |
|-----|------|-------------|
| `runs:all` | Sorted set | All run IDs scored by creation timestamp |
| `run:{id}` | Hash | Now includes `prompt`, `plan` (JSON), `createdAt`, `completedAt`, `status` |
| `run:{id}:frames` | Hash | Per-frame final state: `{ status, assetUrl?, error? }` keyed by frame ID |

### Result
Full round-trip verified: generate → history page shows card with thumbnails → click → graph reconstructed with all images.

---

## 2026-05-14 04:00 IST — Initial scaffold

### What
Created the full two-level LLM orchestration system from scratch in a greenfield repo.

### Backend (`backend/`)

| File | Purpose |
|------|---------|
| `package.json` | Node project config — Fastify 5, BullMQ 5, `@google/genai`, ioredis, Zod, uuid |
| `tsconfig.json` | ES2022 target, ESNext modules, bundler resolution |
| `src/config.ts` | Loads `.env` from repo root, exports all tunables (port, Redis URL, model IDs, concurrency) |
| `src/schema.ts` | Zod schemas: `PlanSchema` (scenes + frames), `RunRequestSchema` (collated prompt input) |
| `src/sse.ts` | Shared `EventEmitter` for run-scoped events; `emitRunEvent()` helper |
| `src/gemini.ts` | Gemini SDK wrapper — `orchestrate()` for JSON plan generation, `generateFrameImage()` for Imagen 4K image calls, `friendlyError()` for human-readable error extraction |
| `src/queues.ts` | BullMQ queue definitions: `orchestrate` (concurrency 1) and `generate-frame` (configurable concurrency) |
| `src/runTracker.ts` | Redis-backed atomic completion tracker — `initRun()`, `markFrameCompleted()`, `markFramePermanentlyFailed()`, auto-emits `run_complete` when all frames finish |
| `src/workers/orchestrator.ts` | Level 1 worker: calls Gemini text model → Zod-validates plan → `initRun()` → fan-out enqueue N frame jobs with deterministic IDs |
| `src/workers/frameGen.ts` | Level 2 worker: calls Gemini image API → saves PNG to disk → emits `frame_done`/`frame_failed` → tracks completion |
| `src/routes/runs.ts` | `POST /api/runs` (create run + enqueue) and `GET /api/runs/:runId/events` (SSE stream with heartbeat) |
| `src/routes/assets.ts` | `GET /api/assets/runs/:runId/:filename` — serves generated PNGs with path sanitisation |
| `src/index.ts` | Fastify entry: CORS, route registration, worker startup, graceful shutdown on SIGTERM/SIGINT |

### Frontend (`frontend/`)

| File | Purpose |
|------|---------|
| `package.json` | Next.js 15, React 19, `@xyflow/react` 12, elkjs, lucide-react, Tailwind CSS 3.4 |
| `tsconfig.json` | Bundler module resolution, `@/*` path alias |
| `next.config.ts` | Allows images from `localhost:3001` |
| `tailwind.config.ts` | JewelAI design tokens: accent, muted, display/body fonts, pill/card/badge radii |
| `postcss.config.mjs` | Tailwind + autoprefixer |
| `src/app/globals.css` | CSS variables (--bg, --accent, --white-*, --radius-*), Google Fonts import (Big Shoulders Display, DM Sans), scrollbar theming, React Flow dark overrides |
| `src/app/layout.tsx` | Root layout: dark HTML class, font-body on body |
| `src/app/page.tsx` | Wraps `FlowCanvas` in `ReactFlowProvider` |
| `src/components/flow/FlowCanvas.tsx` | Main orchestration UI: state machine (idle→orchestrating→generating→complete→failed), SSE subscription via `EventSource`, ELK auto-layout on `plan_ready`, per-frame node updates |
| `src/components/flow/CollatedPromptNode.tsx` | Custom node: shows user's input prompt in a dark card with orange accent |
| `src/components/flow/OrchestratorNode.tsx` | Custom node: analyzing spinner → scene/frame counts → or error state |
| `src/components/flow/SceneGroupNode.tsx` | Custom node: scene title + summary, orange label |
| `src/components/flow/FrameNode.tsx` | Custom node: 16:9 thumbnail area, status-dependent borders (queued/generating/complete/failed), frame index + prompt snippet |
| `src/components/ui/Button.tsx` | JewelAI-style button: primary/secondary/ghost, pill radii, active:scale-[0.98], orange accent |
| `src/components/ui/StatusBadge.tsx` | Status pill: queued (white), generating (orange spin), complete (emerald), failed (red) |
| `src/lib/layout.ts` | ELK layout engine wrapper: layered top-down, per-node-type dimensions, spline edge routing |
| `src/lib/utils.ts` | `cn()` — clsx + tailwind-merge |
| `.env.local` | `NEXT_PUBLIC_API_URL=http://localhost:3001` |

### Root

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Redis 7 Alpine with AOF persistence and health check |
| `.env.example` | Template for all env vars with defaults documented |
| `README.md` | Quick start, architecture diagram, env var table, project structure |
| `JewelAI_Design_System.md` | Pre-existing design reference (not modified) |
| `.env` | Pre-existing env with Gemini API key (not modified) |

---

## 2026-05-14 04:13 IST — BullMQ job ID fix

### What
Fixed "Custom Id cannot contain :" error that prevented frame generation jobs from being enqueued.

### Why
BullMQ disallows colons in custom job IDs. The deterministic frame job IDs used `${runId}:${frameId}` which contains a colon separator. Changed to `--` separator.

### Files changed
| File | Change |
|------|--------|
| `backend/src/workers/orchestrator.ts` | Changed job ID format from `${runId}:${frameId}` to `${runId}--${frameId}` |

### Result
Full end-to-end pipeline now works: prompt → orchestrator plan → parallel image generation → live graph update with thumbnails.

---

## 2026-05-14 04:07 IST — Error display improvement

### What
Improved error messages displayed in the Scene Analyzer node when the Gemini API returns errors.

### Why
The raw Gemini SDK error contained the full JSON response body, making the error message unreadable in the UI. Needed to extract just the human-readable `error.message` field.

### Files changed
| File | Change |
|------|--------|
| `backend/src/gemini.ts` | Added `friendlyError()` — parses JSON error bodies and extracts `.error.message` |
| `backend/src/workers/orchestrator.ts` | Imported `friendlyError`, used it in `orchestrator_failed` event emission |
| `backend/src/workers/frameGen.ts` | Imported `friendlyError`, used it in `frame_failed` event emission |
| `docker-compose.yml` | Removed deprecated `version: "3.9"` key (docker compose warning) |

### Result
Error now displays as *"API key expired. Please renew the API key."* instead of a raw JSON blob.

---

## 2026-05-14 04:05 IST — TypeScript / font fixes

### What
Fixed TypeScript compilation errors in the frontend.

### Why
1. `Big_Shoulders_Display` was not a valid export from `next/font/google` in the installed Next.js version.
2. `useNodesState([])` / `useEdgesState([])` inferred `never[]` from the empty array, cascading type errors across the FlowCanvas.
3. `animated` property was duplicated in edge objects (specified before and after spread).

### Files changed
| File | Change |
|------|--------|
| `frontend/src/app/layout.tsx` | Removed `next/font/google` imports; fonts now loaded via CSS `@import` in globals.css |
| `frontend/src/app/globals.css` | Added `@import url(...)` for Google Fonts; added `--font-big-shoulders` and `--font-dm-sans` CSS variables |
| `frontend/src/components/flow/FlowCanvas.tsx` | Cast initial state to `Node[]` / `Edge[]`; replaced `edgeDefaults` spread with explicit `edgeStyle`; removed `animated` duplication |

---

*To add a new entry: copy the template below, fill in details, and prepend to this log.*

```markdown
## YYYY-MM-DD HH:MM TZ — Short title

### What
One-sentence summary.

### Why
Motivation / trigger.

### Files changed
| File | Change |
|------|--------|
| `path/to/file` | What changed |

### Result
Observable outcome.
```
