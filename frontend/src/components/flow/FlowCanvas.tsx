'use client';

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  type FormEvent,
} from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Link from 'next/link';
import {
  Send,
  Wand2,
  RotateCcw,
  Network,
  History,
  ImagePlus,
  X,
  OctagonX,
  ScrollText,
  Download,
  RefreshCw,
  ImagePlay,
  Plus,
  HelpCircle,
  CirclePlus,
} from 'lucide-react';

import { CollatedPromptNode } from './CollatedPromptNode';
import { OrchestratorNode } from './OrchestratorNode';
import { SceneGroupNode } from './SceneGroupNode';
import { FrameNode } from './FrameNode';
import { VideoNode } from './VideoNode';
import { Button } from '@/components/ui/Button';
import { ImageLightbox, type LightboxImage } from '@/components/ui/ImageLightbox';
import { layoutGraph } from '@/lib/layout';
import { estimateSceneCount } from '@/lib/sceneEstimate';
import { SCENE_ACCENTS } from '@/lib/sceneColors';
import { pushToast } from '@/components/ui/ToastStack';
import { API_URL } from '@/lib/apiBase';

const PROMPT_MAX = 4000;

function GhostGraphNode() {
  return (
    <div
      className="pointer-events-none h-[72px] w-[140px] rounded-2xl border border-white/[0.08] bg-[#0d0d0d]"
      style={{ opacity: 0.08 }}
    />
  );
}

const nodeTypes = {
  collatedPrompt: CollatedPromptNode,
  orchestrator: OrchestratorNode,
  sceneGroup: SceneGroupNode,
  frame: FrameNode,
  video: VideoNode,
  ghost: GhostGraphNode,
};

const GHOST_NODES: Node[] = [
  { id: 'g1', type: 'ghost', position: { x: -380, y: -220 }, data: {}, selectable: false, draggable: false, focusable: false },
  { id: 'g2', type: 'ghost', position: { x: -120, y: -260 }, data: {}, selectable: false, draggable: false, focusable: false },
  { id: 'g3', type: 'ghost', position: { x: 140, y: -200 }, data: {}, selectable: false, draggable: false, focusable: false },
  { id: 'g4', type: 'ghost', position: { x: -280, y: 40 }, data: {}, selectable: false, draggable: false, focusable: false },
  { id: 'g5', type: 'ghost', position: { x: 20, y: 20 }, data: {}, selectable: false, draggable: false, focusable: false },
  { id: 'g6', type: 'ghost', position: { x: 300, y: 60 }, data: {}, selectable: false, draggable: false, focusable: false },
];

const GHOST_EDGES: Edge[] = [
  { id: 'ge1', source: 'g1', target: 'g2', selectable: false, focusable: false, style: { stroke: '#333', opacity: 0.06 } },
  { id: 'ge2', source: 'g2', target: 'g3', selectable: false, focusable: false, style: { stroke: '#333', opacity: 0.06 } },
  { id: 'ge3', source: 'g2', target: 'g4', selectable: false, focusable: false, style: { stroke: '#333', opacity: 0.06 } },
  { id: 'ge4', source: 'g2', target: 'g5', selectable: false, focusable: false, style: { stroke: '#333', opacity: 0.06 } },
  { id: 'ge5', source: 'g3', target: 'g6', selectable: false, focusable: false, style: { stroke: '#333', opacity: 0.06 } },
];

type RunStatus = 'idle' | 'orchestrating' | 'generating' | 'complete' | 'failed' | 'killed';

interface Plan {
  totalFrames: number;
  scenes: { sceneId: string; title: string; summary: string }[];
  frames: {
    id: string;
    sceneId: string;
    frameIndex: number;
    prompt: string;
  }[];
}

function globalFrameNumber(plan: Plan, frameId: string): number {
  const sceneIdx = new Map(plan.scenes.map((s, i) => [s.sceneId, i]));
  const sorted = [...plan.frames].sort((a, b) => {
    const ai = sceneIdx.get(a.sceneId) ?? 999;
    const bi = sceneIdx.get(b.sceneId) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.frameIndex - b.frameIndex;
  });
  const i = sorted.findIndex((x) => x.id === frameId);
  return i < 0 ? 1 : i + 1;
}

interface Props {
  loadRunId?: string;
}

/* ── helpers to build a full graph from a plan ── */

function buildNodes(
  promptText: string,
  plan: Plan,
  frameOverrides?: Record<string, { status: string; assetUrl?: string; thumbUrl?: string; error?: string }>,
  videoOverrides?: Record<string, { status: string; videoUrl?: string; motionPrompt?: string; error?: string }>,
): Node[] {
  const videoNodes: Node[] = [];

  if (videoOverrides) {
    for (const [frameId, vid] of Object.entries(videoOverrides)) {
      const frame = plan.frames.find((f) => f.id === frameId);
      if (!frame) continue;
      videoNodes.push({
        id: `video-${frameId}`,
        type: 'video' as const,
        position: { x: 0, y: 0 },
        data: {
          videoStatus: vid.status,
          videoUrl: vid.videoUrl,
          motionPrompt: vid.motionPrompt,
          parentPrompt: frame.prompt,
          frameIndex: frame.frameIndex,
          frameNumber: globalFrameNumber(plan, frameId),
          error: vid.error,
        },
      });
    }
  }

  return [
    {
      id: 'input',
      type: 'collatedPrompt',
      position: { x: 0, y: 0 },
      data: { prompt: promptText },
    },
    {
      id: 'orchestrator',
      type: 'orchestrator',
      position: { x: 0, y: 0 },
      data: {
        status: 'complete',
        sceneCount: plan.scenes.length,
        frameCount: plan.totalFrames,
      },
    },
    ...plan.scenes.map((s, i) => {
      const framesIn = plan.frames.filter((f) => f.sceneId === s.sceneId);
      const complete = framesIn.filter(
        (f) => frameOverrides?.[f.id]?.status === 'complete',
      ).length;
      const previews = framesIn
        .filter((f) => frameOverrides?.[f.id]?.thumbUrl)
        .slice(0, 4)
        .map((f) => frameOverrides![f.id]!.thumbUrl as string);
      return {
        id: s.sceneId,
        type: 'sceneGroup' as const,
        position: { x: 0, y: 0 },
        data: {
          title: s.title,
          summary: s.summary,
          sceneColor: SCENE_ACCENTS[i % SCENE_ACCENTS.length],
          collapsed: false,
          framesComplete: complete,
          framesTotal: framesIn.length,
          sceneId: s.sceneId,
          previewThumbUrls: previews,
        },
      };
    }),
    ...plan.frames.map((f) => {
      const over = frameOverrides?.[f.id];
      const vid = videoOverrides?.[f.id];
      const si = plan.scenes.findIndex((sc) => sc.sceneId === f.sceneId);
      const color = SCENE_ACCENTS[Math.max(0, si) % SCENE_ACCENTS.length];
      return {
        id: f.id,
        type: 'frame' as const,
        position: { x: 0, y: 0 },
        data: {
          status: over?.status ?? 'queued',
          prompt: f.prompt,
          frameIndex: f.frameIndex,
          sceneId: f.sceneId,
          sceneColor: color,
          frameNumber: globalFrameNumber(plan, f.id),
          assetUrl: over?.assetUrl,
          thumbUrl: over?.thumbUrl,
          error: over?.error,
          videoStatus: vid?.status ?? 'idle',
          videoUrl: vid?.videoUrl,
          motionPrompt: vid?.motionPrompt,
        },
      };
    }),
    ...videoNodes,
  ];
}

const videoEdgeStyle = { stroke: '#a855f7', strokeWidth: 1.5, strokeDasharray: '4 3' };

function buildEdges(
  plan: Plan,
  videoOverrides?: Record<string, { status: string }>,
): Edge[] {
  const videoEdges: Edge[] = [];
  if (videoOverrides) {
    for (const frameId of Object.keys(videoOverrides)) {
      videoEdges.push({
        id: `e-${frameId}-video`,
        source: frameId,
        sourceHandle: 'source-video',
        target: `video-${frameId}`,
        targetHandle: 'target-top',
        style: videoEdgeStyle,
      });
    }
  }

  return [
    {
      id: 'e-input-orch',
      source: 'input',
      target: 'orchestrator',
      style: { stroke: '#ff5b00', strokeWidth: 2 },
    },
    ...plan.scenes.map((s, i) => ({
      id: `e-orch-${s.sceneId}`,
      source: 'orchestrator',
      target: s.sceneId,
      style: { stroke: SCENE_ACCENTS[i % SCENE_ACCENTS.length], strokeWidth: 1.5 },
    })),
    ...plan.frames.map((f) => {
      const si = plan.scenes.findIndex((sc) => sc.sceneId === f.sceneId);
      const stroke = SCENE_ACCENTS[Math.max(0, si) % SCENE_ACCENTS.length];
      return {
        id: `e-${f.sceneId}-${f.id}`,
        source: f.sceneId,
        target: f.id,
        targetHandle: 'target-top',
        style: { stroke, strokeWidth: 1.5 },
      };
    }),
    ...videoEdges,
  ];
}

export default function FlowCanvas({ loadRunId }: Props) {
  const [status, setStatus] = useState<RunStatus>('idle');
  const [prompt, setPrompt] = useState('');
  const [imageSize, setImageSize] = useState<string>('4K');
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const { fitView } = useReactFlow();
  const esRef = useRef<EventSource | null>(null);
  const handleSSERef = useRef<
    ((event: { type: string; data: Record<string, unknown> }) => void | Promise<void>) | null
  >(null);
  const promptRef = useRef('');
  const runIdRef = useRef<string | null>(null);
  const [promptModal, setPromptModal] = useState<string | null>(null);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [videoPlayer, setVideoPlayer] = useState<{ videoUrl: string; motionPrompt?: string; prompt?: string } | null>(null);
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [refPreviews, setRefPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sceneEstimate, setSceneEstimate] = useState<number | null>(null);
  const sceneDebounceRef = useRef<number | undefined>(undefined);
  const [refZoneShake, setRefZoneShake] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const shortcutsRef = useRef<HTMLDivElement>(null);
  /** Wall-clock start of current run (state so elapsed / fps can read it during render). */
  const [runStartedAtMs, setRunStartedAtMs] = useState<number | null>(null);
  const runStartedAtRef = useRef<number | null>(null);
  const [frameDoneTimes, setFrameDoneTimes] = useState<number[]>([]);
  const [activeRunsCount, setActiveRunsCount] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [elapsedFrozen, setElapsedFrozen] = useState<number | null>(null);

  const displayNodes = useMemo(() => {
    if (status === 'idle' && !loadRunId && nodes.length === 0) return GHOST_NODES;
    return nodes;
  }, [status, loadRunId, nodes]);

  const displayEdges = useMemo(() => {
    if (status === 'idle' && !loadRunId && edges.length === 0) return GHOST_EDGES;
    return edges;
  }, [status, loadRunId, edges]);

  const graphStats = useMemo(() => {
    const frames = nodes.filter((n) => n.type === 'frame');
    return {
      scenes: nodes.filter((n) => n.type === 'sceneGroup').length,
      frames: frames.length,
      generating: frames.filter((f) => f.data?.status === 'generating').length,
      complete: frames.filter((f) => f.data?.status === 'complete').length,
      failed: frames.filter((f) => f.data?.status === 'failed').length,
    };
  }, [nodes]);

  const progressPct =
    totalFrames > 0 && (status === 'generating' || status === 'complete' || status === 'killed')
      ? Math.min(100, Math.round((completedCount / totalFrames) * 100))
      : 0;

  useEffect(() => {
    runStartedAtRef.current = runStartedAtMs;
  }, [runStartedAtMs]);

  useEffect(() => {
    if (status === 'orchestrating' || status === 'generating') {
      const id = window.setInterval(() => setClock(Date.now()), 1000);
      return () => window.clearInterval(id);
    }
  }, [status]);

  const freezeRunElapsed = useCallback(() => {
    setElapsedFrozen((prev) => {
      if (prev != null) return prev;
      const t = runStartedAtRef.current;
      return t != null ? Date.now() - t : null;
    });
  }, []);

  const elapsedMs =
    elapsedFrozen != null
      ? elapsedFrozen
      : runStartedAtMs != null
        ? clock - runStartedAtMs
        : 0;

  const formatDur = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    if (m <= 0) return `${sec}s`;
    if (m < 60) return `${m}m ${sec}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  const frameTimes = frameDoneTimes;
  let fpsLabel: string | null = null;
  if (frameTimes.length >= 2) {
    const dt = (frameTimes[frameTimes.length - 1]! - frameTimes[0]!) / 1000;
    if (dt > 0.05) {
      const n = frameTimes.length - 1;
      fpsLabel = `${(n / dt).toFixed(1)} fps`;
    }
  }

  let etaLabel: string | null = null;
  if (
    status === 'generating' &&
    completedCount >= 3 &&
    totalFrames > completedCount &&
    frameTimes.length >= 2
  ) {
    const span = frameTimes[frameTimes.length - 1]! - frameTimes[0]!;
    const intervals = Math.max(1, frameTimes.length - 1);
    const avg = span / intervals;
    const rem = totalFrames - completedCount;
    etaLabel = `~${formatDur(avg * rem)} left`;
  }

  const addReferenceFiles = useCallback((files: FileList | File[]) => {
    const newFiles = Array.from(files).filter(
      (f) => f.type.startsWith('image/') && f.size <= 20 * 1024 * 1024,
    );
    setRefFiles((prev) => [...prev, ...newFiles].slice(0, 10));
    for (const f of newFiles) {
      const reader = new FileReader();
      reader.onload = () => {
        setRefPreviews((prev) => [...prev, reader.result as string].slice(0, 10));
      };
      reader.readAsDataURL(f);
    }
  }, []);

  const removeReference = useCallback((idx: number) => {
    setRefFiles((prev) => prev.filter((_, i) => i !== idx));
    setRefPreviews((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleRefZoneDrop = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.classList.remove('border-[#ff5b00]/40');
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      const valid = files.filter((f) => f.type.startsWith('image/') && f.size <= 20 * 1024 * 1024);
      const hadInvalid = files.some((f) => !f.type.startsWith('image/') || f.size > 20 * 1024 * 1024);
      if (hadInvalid && valid.length === 0) {
        setRefZoneShake(true);
        window.setTimeout(() => setRefZoneShake(false), 450);
        return;
      }
      if (valid.length > 0) addReferenceFiles(valid);
    },
    [addReferenceFiles],
  );

  /* ── Lightbox: listen for image-click events from FrameNode ── */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as LightboxImage;
      const completed = nodes
        .filter((n) => n.type === 'frame' && n.data?.status === 'complete' && n.data?.assetUrl)
        .sort((a, b) => {
          const ai = (a.data?.frameIndex as number) ?? 0;
          const bi = (b.data?.frameIndex as number) ?? 0;
          if (ai !== bi) return ai - bi;
          return (a.id ?? '').localeCompare(b.id ?? '');
        })
        .map((n) => ({
          frameId: n.id,
          assetUrl: n.data!.assetUrl as string,
          thumbUrl: (n.data!.thumbUrl as string) ?? undefined,
          prompt: n.data!.prompt as string,
          frameIndex: n.data!.frameIndex as number,
        }));
      const idx = completed.findIndex((img) => img.assetUrl === detail.assetUrl);
      setLightboxImages(completed);
      setLightboxIndex(idx >= 0 ? idx : 0);
    };
    document.addEventListener('nodewow:view-image', handler);
    return () => document.removeEventListener('nodewow:view-image', handler);
  }, [nodes]);

  /* ── Prompt modal: listen for view-prompt events from FrameNode ── */
  const promptTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { prompt: string };
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = setTimeout(() => setPromptModal(detail.prompt), 50);
    };
    document.addEventListener('nodewow:view-prompt', handler);
    return () => document.removeEventListener('nodewow:view-prompt', handler);
  }, []);

  /* ── Play video: dispatch from FrameNode ── */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { videoUrl: string; motionPrompt?: string; prompt?: string };
      setVideoPlayer(detail);
    };
    document.addEventListener('nodewow:play-video', handler);
    return () => document.removeEventListener('nodewow:play-video', handler);
  }, []);

  /* ── Keep input node status in sync ── */
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === 'input' ? { ...n, data: { ...n.data, status } } : n,
      ),
    );
  }, [status, setNodes]);

  /* ── Load a previously‐completed run ── */
  const loadPreviousRun = useCallback(
    async (runId: string) => {
      try {
        const res = await fetch(`${API_URL}/api/runs/${runId}/details`);
        if (!res.ok) return;
        const data = await res.json();

        setRunStartedAtMs(null);
        setElapsedFrozen(null);
        setFrameDoneTimes([]);

        promptRef.current = data.prompt ?? '';

        if (!data.plan) {
          setStatus(data.status === 'failed' ? 'failed' : 'orchestrating');
          const initial: Node[] = [
            { id: 'input', type: 'collatedPrompt', position: { x: 0, y: 0 }, data: { prompt: data.prompt } },
            { id: 'orchestrator', type: 'orchestrator', position: { x: 0, y: 200 }, data: { status: data.status === 'failed' ? 'failed' : 'analyzing', error: data.status === 'failed' ? 'Orchestration failed' : undefined } },
          ];
          setNodes(initial);
          setEdges([{ id: 'e-input-orch', source: 'input', target: 'orchestrator', style: { stroke: '#ff5b00', strokeWidth: 2 } }]);
          setTimeout(() => fitView({ padding: 0.3, duration: 500 }), 80);
          return;
        }

        const plan = data.plan as Plan;
        setTotalFrames(plan.totalFrames);
        setCompletedCount(data.completed);
        runIdRef.current = runId;

        const allNodes = buildNodes(data.prompt, plan, data.frames, data.videos);
        const allEdges = buildEdges(plan, data.videos);

        const laidOut = await layoutGraph(allNodes, allEdges);
        setNodes(laidOut);
        setEdges(allEdges);

        const backendStatus = data.status as string;
        if (backendStatus === 'complete') {
          setStatus('complete');
        } else if (backendStatus === 'failed') {
          setStatus('failed');
        } else if (backendStatus === 'killed') {
          setStatus('killed');
        } else {
          setStatus(backendStatus === 'orchestrating' ? 'orchestrating' : 'generating');
          const es = new EventSource(`${API_URL}/api/runs/${runId}/events`);
          esRef.current = es;
          setRunStartedAtMs(Date.now());
          setElapsedFrozen(null);
          es.onmessage = (ev) => {
            try {
              void handleSSERef.current?.(JSON.parse(ev.data));
            } catch {
              /* skip */
            }
          };
          es.onerror = () => es.close();
        }

        setTimeout(() => fitView({ padding: 0.22, duration: 800 }), 200);
      } catch { /* network error */ }
    },
    [setNodes, setEdges, fitView, setElapsedFrozen],
  );

  useEffect(() => {
    if (!loadRunId) return;
    queueMicrotask(() => {
      void loadPreviousRun(loadRunId);
    });
  }, [loadRunId, loadPreviousRun]);

  /* ── SSE event dispatcher ── */
  const handleSSE = useCallback(
    async (event: { type: string; data: Record<string, unknown> }) => {
      switch (event.type) {
        case 'plan_ready': {
          const plan = event.data.plan as Plan;
          setStatus('generating');
          setTotalFrames(plan.totalFrames);
          setFrameDoneTimes([]);

          const allNodes = buildNodes(promptRef.current, plan);
          const allEdges = buildEdges(plan);

          const laidOut = await layoutGraph(allNodes, allEdges);
          setNodes(laidOut);
          setEdges(allEdges);
          setTimeout(() => fitView({ padding: 0.22, duration: 800 }), 200);
          break;
        }

        case 'frame_started':
          setNodes((nds) =>
            nds.map((n) =>
              n.id === (event.data.frameId as string)
                ? { ...n, data: { ...n.data, status: 'generating' } }
                : n,
            ),
          );
          break;

        case 'frame_done': {
          const fid = event.data.frameId as string;
          const thumb = (event.data.thumbUrl as string) ?? undefined;
          setCompletedCount((c) => c + 1);
          setFrameDoneTimes((prev) => [...prev, Date.now()].slice(-5));
          setNodes((nds) => {
            const sceneId = nds.find((x) => x.id === fid)?.data?.sceneId as string | undefined;
            return nds.map((n) => {
              if (n.id === fid) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    status: 'complete',
                    assetUrl: event.data.assetUrl as string,
                    thumbUrl: thumb,
                  },
                };
              }
              if (sceneId && n.type === 'sceneGroup' && n.id === sceneId) {
                const prev = (n.data?.framesComplete as number) ?? 0;
                const p = [...((n.data?.previewThumbUrls as string[]) ?? [])];
                if (thumb && !p.includes(thumb)) p.unshift(thumb);
                return {
                  ...n,
                  data: {
                    ...n.data,
                    framesComplete: prev + 1,
                    previewThumbUrls: p.slice(0, 4),
                  },
                };
              }
              return n;
            });
          });
          break;
        }

        case 'frame_failed': {
          const failedId = event.data.frameId as string;
          pushToast({
            kind: 'error',
            message: 'Frame failed — click to retry',
            actionLabel: 'Retry',
            onAction: () => {
              document.dispatchEvent(
                new CustomEvent('nodewow:retry-frame', { detail: { frameId: failedId } }),
              );
            },
          });
          setNodes((nds) =>
            nds.map((n) =>
              n.id === (event.data.frameId as string)
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      status: 'failed',
                      error: event.data.error as string,
                    },
                  }
                : n,
            ),
          );
          break;
        }

        case 'run_complete':
          freezeRunElapsed();
          setStatus('complete');
          esRef.current?.close();
          pushToast({
            kind: 'success',
            message: `Run complete — ${(event.data.completed as number) ?? 0} frames generated`,
          });
          break;

        case 'orchestrator_failed':
          freezeRunElapsed();
          setStatus('failed');
          setNodes((nds) =>
            nds.map((n) =>
              n.id === 'orchestrator'
                ? {
                    ...n,
                    data: {
                      status: 'failed',
                      error: event.data.error as string,
                    },
                  }
                : n,
            ),
          );
          esRef.current?.close();
          break;

        case 'run_killed':
          freezeRunElapsed();
          setStatus('killed');
          esRef.current?.close();
          break;

        case 'video_started': {
          const fId = event.data.frameId as string;
          const videoNodeId = `video-${fId}`;
          setNodes((nds) => {
            const exists = nds.some((n) => n.id === videoNodeId);
            const frameNode = nds.find((n) => n.id === fId);
            const updated = nds.map((n) => {
              if (n.id === fId) {
                return { ...n, data: { ...n.data, videoStatus: 'generating' } };
              }
              if (n.id === videoNodeId) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    videoStatus: 'generating',
                    error: undefined,
                    videoUrl: undefined,
                    motionPrompt: undefined,
                  },
                };
              }
              return n;
            });
            if (!exists && frameNode) {
              updated.push({
                id: videoNodeId,
                type: 'video',
                position: { x: frameNode.position.x, y: frameNode.position.y + 340 },
                data: {
                  videoStatus: 'generating',
                  frameIndex: frameNode.data?.frameIndex ?? 0,
                  frameNumber: (frameNode.data as { frameNumber?: number }).frameNumber,
                  parentPrompt: frameNode.data?.prompt,
                },
              });
            }
            return updated;
          });
          setEdges((eds) => {
            const edgeId = `e-${fId}-video`;
            if (eds.some((e) => e.id === edgeId)) return eds;
            return [...eds, { id: edgeId, source: fId, sourceHandle: 'source-video', target: videoNodeId, targetHandle: 'target-top', style: videoEdgeStyle }];
          });
          break;
        }

        case 'video_motion_ready': {
          const fId = event.data.frameId as string;
          setNodes((nds) =>
            nds.map((n) =>
              n.id === `video-${fId}`
                ? { ...n, data: { ...n.data, motionPrompt: event.data.motionPrompt } }
                : n,
            ),
          );
          break;
        }

        case 'video_done': {
          const fId = event.data.frameId as string;
          pushToast({
            kind: 'info',
            message: 'Video clip is ready — open the video node to play',
          });
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === fId) return { ...n, data: { ...n.data, videoStatus: 'ready', videoUrl: event.data.videoUrl } };
              if (n.id === `video-${fId}`) return { ...n, data: { ...n.data, videoStatus: 'ready', videoUrl: event.data.videoUrl, motionPrompt: event.data.motionPrompt } };
              return n;
            }),
          );
          break;
        }

        case 'video_failed': {
          const fId = event.data.frameId as string;
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === fId) return { ...n, data: { ...n.data, videoStatus: 'failed' } };
              if (n.id === `video-${fId}`) return { ...n, data: { ...n.data, videoStatus: 'failed', error: event.data.error } };
              return n;
            }),
          );
          break;
        }
      }
    },
    [setNodes, setEdges, fitView, freezeRunElapsed],
  );

  useLayoutEffect(() => {
    handleSSERef.current = handleSSE;
  }, [handleSSE]);

  /* ── Submit ── */
  const handleGenerate = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const text = prompt.trim();
      if (!text) return;
      promptRef.current = text;
      setRunStartedAtMs(Date.now());
      setElapsedFrozen(null);
      setFrameDoneTimes([]);
      setCompletedCount(0);
      setTotalFrames(0);
      setStatus('orchestrating');

      const initial: Node[] = [
        {
          id: 'input',
          type: 'collatedPrompt',
          position: { x: 0, y: 0 },
          data: { prompt: text },
        },
        {
          id: 'orchestrator',
          type: 'orchestrator',
          position: { x: 0, y: 200 },
          data: { status: 'analyzing' },
        },
      ];
      setNodes(initial);
      setEdges([
        {
          id: 'e-input-orch',
          source: 'input',
          target: 'orchestrator',
          animated: true,
          style: { stroke: '#ff5b00', strokeWidth: 2 },
        },
      ]);
      setTimeout(() => fitView({ padding: 0.4, duration: 500 }), 60);

      try {
        let res: Response;
        if (refFiles.length > 0) {
          const fd = new FormData();
          fd.append('collatedPrompt', text);
          fd.append('imageSize', imageSize);
          for (const file of refFiles) {
            fd.append('references', file);
          }
          res = await fetch(`${API_URL}/api/runs`, { method: 'POST', body: fd });
        } else {
          res = await fetch(`${API_URL}/api/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collatedPrompt: text, imageSize }),
          });
        }
        if (!res.ok) throw new Error(await res.text());
        const { runId } = (await res.json()) as { runId: string };
        runIdRef.current = runId;

        const es = new EventSource(`${API_URL}/api/runs/${runId}/events`);
        esRef.current = es;
        es.onmessage = (ev) => {
          try {
            handleSSE(JSON.parse(ev.data));
          } catch { /* ignore parse errors */ }
        };
        es.onerror = () => es.close();
      } catch {
        freezeRunElapsed();
        setStatus('failed');
        setNodes((nds) =>
          nds.map((n) =>
            n.id === 'orchestrator'
              ? {
                  ...n,
                  data: {
                    status: 'failed',
                    error: 'Could not reach the backend — is it running?',
                  },
                }
              : n,
          ),
        );
      }
    },
    [prompt, refFiles, imageSize, handleSSE, freezeRunElapsed, setNodes, setEdges, fitView],
  );

  const handleReset = useCallback(() => {
    esRef.current?.close();
    setStatus('idle');
    setNodes([]);
    setEdges([]);
    setPrompt('');
    setRefFiles([]);
    setRefPreviews([]);
    setCompletedCount(0);
    setTotalFrames(0);
    setRunStartedAtMs(null);
    setElapsedFrozen(null);
    setFrameDoneTimes([]);
    runIdRef.current = null;
  }, [setNodes, setEdges]);

  const handleKill = useCallback(async () => {
    const id = runIdRef.current;
    if (!id) return;
    try {
      await fetch(`${API_URL}/api/runs/${id}/kill`, { method: 'POST' });
    } catch { /* network error — still close locally */ }
    esRef.current?.close();
    freezeRunElapsed();
    setStatus('killed');
  }, [freezeRunElapsed]);

  useEffect(() => {
    const handler = () => { handleKill(); };
    document.addEventListener('nodewow:kill-run', handler);
    return () => document.removeEventListener('nodewow:kill-run', handler);
  }, [handleKill]);

  /* ── Generate video: dispatch from FrameNode ── */
  useEffect(() => {
    const handler = async (e: Event) => {
      const { frameId } = (e as CustomEvent).detail as { frameId: string };
      const id = runIdRef.current || (typeof loadRunId === 'string' ? loadRunId : null);
      if (!id) return;

      const videoNodeId = `video-${frameId}`;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === frameId) {
            return { ...n, data: { ...n.data, videoStatus: 'generating' } };
          }
          if (n.id === videoNodeId) {
            return {
              ...n,
              data: {
                ...n.data,
                videoStatus: 'generating',
                error: undefined,
                videoUrl: undefined,
                motionPrompt: undefined,
              },
            };
          }
          return n;
        }),
      );

      try {
        const res = await fetch(`${API_URL}/api/runs/${id}/frames/${frameId}/video`, { method: 'POST' });
        if (!res.ok) {
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === frameId) {
                return { ...n, data: { ...n.data, videoStatus: 'failed' } };
              }
              if (n.id === videoNodeId) {
                return { ...n, data: { ...n.data, videoStatus: 'failed' } };
              }
              return n;
            }),
          );
        }
        if (!esRef.current || esRef.current.readyState === EventSource.CLOSED) {
          const es = new EventSource(`${API_URL}/api/runs/${id}/events`);
          esRef.current = es;
          es.onmessage = (msg) => {
            try { handleSSE(JSON.parse(msg.data)); } catch { /* ignore */ }
          };
        }
      } catch { /* ignore */ }
    };
    document.addEventListener('nodewow:generate-video', handler);
    return () => document.removeEventListener('nodewow:generate-video', handler);
  }, [loadRunId, handleSSE, setNodes]);

  const handleRetry = useCallback(async () => {
    const id = runIdRef.current || (typeof loadRunId === 'string' ? loadRunId : null);
    if (!id) return;
    try {
      const res = await fetch(`${API_URL}/api/runs/${id}/retry`, { method: 'POST' });
      if (!res.ok) return;
      setStatus('generating');
      setNodes((nds) =>
        nds.map((n) => {
          if (n.type === 'frame' && (n.data?.status === 'failed' || n.data?.status === 'queued')) {
            return { ...n, data: { ...n.data, status: 'queued' } };
          }
          return n;
        }),
      );
      const es = new EventSource(`${API_URL}/api/runs/${id}/events`);
      esRef.current?.close();
      esRef.current = es;
      es.onmessage = (msg) => {
        try { handleSSE(JSON.parse(msg.data)); } catch { /* ignore */ }
      };
    } catch { /* ignore */ }
  }, [loadRunId, handleSSE, setNodes]);

  useEffect(() => () => esRef.current?.close(), []);

  const isIdle = status === 'idle' && !loadRunId;
  const isViewing = !!loadRunId;
  const ghostMode = isIdle && nodes.length === 0;

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(`${API_URL}/api/runs`);
        const d = await r.json();
        const runs = d.runs ?? [];
        const n = runs.filter(
          (x: { status: string }) =>
            x.status === 'generating' || x.status === 'orchestrating',
        ).length;
        setActiveRunsCount(n);
      } catch {
        /* ignore */
      }
    };
    void poll();
    const id = window.setInterval(poll, 10_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const h = (e: Event) => {
      const { sceneId } = (e as CustomEvent).detail as { sceneId: string };
      setNodes((nds) => {
        const sceneNode = nds.find((n) => n.id === sceneId && n.type === 'sceneGroup');
        const cur = !!(sceneNode?.data as { collapsed?: boolean } | undefined)?.collapsed;
        const next = !cur;
        return nds.map((n) => {
          if (n.id === sceneId && n.type === 'sceneGroup') {
            return { ...n, data: { ...n.data, collapsed: next } };
          }
          if (n.type === 'frame' && (n.data as { sceneId?: string }).sceneId === sceneId) {
            return { ...n, hidden: next };
          }
          return n;
        });
      });
    };
    document.addEventListener('nodewow:toggle-scene', h);
    return () => document.removeEventListener('nodewow:toggle-scene', h);
  }, [setNodes]);

  useEffect(() => {
    const handler = async (e: Event) => {
      const { frameId } = (e as CustomEvent).detail as { frameId: string };
      const id = runIdRef.current ?? (typeof loadRunId === 'string' ? loadRunId : null);
      if (!id) return;
      try {
        const res = await fetch(`${API_URL}/api/runs/${id}/frames/${frameId}/retry`, {
          method: 'POST',
        });
        if (!res.ok) return;
        setNodes((nds) =>
          nds.map((n) =>
            n.id === frameId
              ? { ...n, data: { ...n.data, status: 'queued', error: undefined } }
              : n,
          ),
        );
        if (!esRef.current || esRef.current.readyState === EventSource.CLOSED) {
          const es = new EventSource(`${API_URL}/api/runs/${id}/events`);
          esRef.current = es;
          es.onmessage = (msg) => {
            try {
              handleSSE(JSON.parse(msg.data));
            } catch {
              /* ignore */
            }
          };
        }
      } catch {
        /* ignore */
      }
    };
    document.addEventListener('nodewow:retry-frame', handler);
    return () => document.removeEventListener('nodewow:retry-frame', handler);
  }, [loadRunId, handleSSE, setNodes]);

  useEffect(() => {
    if (!isIdle) return;
    window.clearTimeout(sceneDebounceRef.current);
    sceneDebounceRef.current = window.setTimeout(() => {
      setSceneEstimate(estimateSceneCount(prompt));
    }, 600);
    return () => window.clearTimeout(sceneDebounceRef.current);
  }, [prompt, isIdle]);

  useEffect(() => {
    if (!showShortcuts) return;
    const close = (ev: MouseEvent) => {
      const t = ev.target;
      if (
        shortcutsRef.current &&
        t instanceof Element &&
        !shortcutsRef.current.contains(t)
      ) {
        setShowShortcuts(false);
      }
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [showShortcuts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowShortcuts(false);
      if (!isIdle && (e.key === 'f' || e.key === 'F')) {
        if ((e.target as HTMLElement).closest('textarea, input')) return;
        void fitView({ padding: 0.22, duration: 400 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fitView, isIdle]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        colorMode="dark"
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.05}
        maxZoom={2}
        className="bg-[#121212]"
        proOptions={{ hideAttribution: true }}
        zoomOnScroll={!isIdle}
        panOnDrag={!isIdle}
        nodesDraggable={!ghostMode}
        nodesConnectable={!ghostMode}
        elementsSelectable={!ghostMode}
        nodesFocusable={!ghostMode}
        edgesFocusable={!ghostMode}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#1e1e1e"
        />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'ghost') return 'rgba(255,255,255,0.04)';
            if (n.type === 'frame') {
              const s = n.data?.status as string | undefined;
              if (s === 'generating') return '#7a3310';
              if (s === 'complete') return '#2f3d32';
              if (s === 'failed') return '#3d2828';
              return '#353535';
            }
            if (n.type === 'video') {
              const vs = n.data?.videoStatus as string | undefined;
              if (vs === 'generating') return '#3a2f48';
              if (vs === 'ready') return '#2c322e';
              if (vs === 'failed') return '#3d2828';
              return '#323232';
            }
            return '#2a2a2a';
          }}
          maskColor="rgba(6, 6, 6, 0.82)"
          pannable
          zoomable
          className="!bg-[#0a0a0a]"
        />

        {/* ── Brand header ── */}
        <Panel position="top-left" className="z-40">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/">
              <div className="flex items-center gap-2.5 rounded-[336px] bg-[#0d0d0d]/80 backdrop-blur-xl border border-[#1a1a1a] px-5 py-3 shadow-2xl fine-hover:hover:border-[#ff5b00]/20 transition-[border-color,transform] duration-200 ease-out-expo fine-hover:hover:-translate-y-px cursor-pointer">
                <Network className="h-5 w-5 text-[#ff5b00]" />
                <span className="font-display text-lg font-black uppercase tracking-[4px] text-white">
                  Node<span className="text-[#ff5b00]">Wow</span>
                </span>
              </div>
            </Link>
            {activeRunsCount > 0 && (
              <span className="rounded-full border border-[#ff5b00]/25 bg-[#ff5b00]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#ff5b00]">
                {activeRunsCount} running
              </span>
            )}
            <Link href="/history" title="Generation history" aria-label="Generation history">
              <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#0d0d0d]/80 backdrop-blur-xl border border-[#1a1a1a] shadow-2xl fine-hover:hover:border-[#ff5b00]/20 transition-[border-color,transform] duration-200 ease-out-expo fine-hover:hover:-translate-y-px cursor-pointer">
                <History className="h-4 w-4 text-white/50" />
              </div>
            </Link>
            <Link href="/">
              <div className="flex h-11 items-center gap-2 rounded-[16px] bg-[#0d0d0d]/80 backdrop-blur-xl border border-[#1a1a1a] px-4 py-2.5 shadow-2xl fine-hover:hover:border-[#ff5b00]/20 transition-[border-color,transform] duration-200 ease-out-expo fine-hover:hover:-translate-y-px cursor-pointer">
                <CirclePlus className="h-4 w-4 text-[#ff5b00]" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                  New Generation
                </span>
              </div>
            </Link>
          </div>
        </Panel>

        {/* ── Idle: hero input (only on main page, not when viewing a past run) ── */}
        {isIdle && (
          <Panel
            position="top-center"
            style={{
              left: '50%',
              top: 'calc(50% + 0.75rem)',
              margin: 0,
              transform: 'translate(-50%, -50%)',
            }}
            className="pointer-events-auto z-10 w-[min(640px,calc(100vw-1.5rem))] px-2 py-3"
          >
            {/* Shadow on outer shell: scroll lives inside so overflow-y does not clip box-shadow */}
            <div className="rounded-[28px] border border-[#1a1a1a] bg-[#0d0d0d] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_12px_40px_-8px_rgba(0,0,0,0.55),0_32px_64px_-16px_rgba(0,0,0,0.65),0_0_0_1px_rgba(0,0,0,0.4)] sm:rounded-[32px]">
              <div className="max-h-[min(calc(100dvh-2.5rem),calc(100svh-2.5rem))] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                <form
                  onSubmit={handleGenerate}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      const t = prompt.trim();
                      if (t && t.length <= PROMPT_MAX) void handleGenerate();
                    }
                  }}
                  className="w-full min-w-0 touch-manipulation p-5 sm:p-8"
                >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ff5b00]/10">
                  <Wand2 className="h-4 w-4 text-[#ff5b00]" />
                </div>
                <div>
                  <h1 className="font-display text-xl font-black uppercase tracking-[3px] text-white">
                    Scene Generator
                  </h1>
                  <p className="mt-0.5 font-body text-[11px] text-white/50">
                    Multiple scenes in one prompt are split, planned, and generated in parallel.
                  </p>
                </div>
              </div>

              <label
                htmlFor="nodewow-hero-prompt"
                className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[3px] text-white/45"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff5b00]" aria-hidden />
                Prompt
              </label>

              <textarea
                id="nodewow-hero-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe each scene: subject, setting, lighting, and wardrobe. Separate scenes with a blank line."
                rows={6}
                maxLength={PROMPT_MAX + 200}
                className="w-full resize-none rounded-[20px] border border-white/5 bg-black/40 px-6 py-4 font-body text-[13px] leading-relaxed text-white/90 placeholder:text-white/25 focus:border-[#ff5b00]/30 focus:outline-none focus:ring-2 focus:ring-[#ff5b00]/10 transition-[border-color,box-shadow] duration-200 ease-out-expo"
              />
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                {sceneEstimate != null && sceneEstimate > 0 && (
                  <span className="text-[11px] font-semibold text-[#ff5b00]">
                    ~{sceneEstimate} scene{sceneEstimate === 1 ? '' : 's'} detected
                  </span>
                )}
                <span
                  className={`ml-auto text-right text-[11px] tabular-nums ${
                    prompt.length > PROMPT_MAX
                      ? 'text-red-400'
                      : prompt.length > 3500
                        ? 'text-amber-400/90'
                        : 'text-white/25'
                  }`}
                >
                  {prompt.length} / {PROMPT_MAX} characters
                </span>
              </div>

              <div className="mt-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addReferenceFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                {refPreviews.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {refPreviews.map((src, i) => (
                      <div
                        key={i}
                        className="group/ref relative h-16 w-16 overflow-hidden rounded-[12px] border border-white/10 bg-black/40"
                      >
                        <img
                          src={src}
                          alt={`Reference ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeReference(i)}
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-white opacity-0 shadow-lg transition-opacity group-hover/ref:opacity-100"
                          aria-label={`Remove reference ${i + 1}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('border-[#ff5b00]/40');
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('border-[#ff5b00]/40');
                  }}
                  onDrop={handleRefZoneDrop}
                  className={`flex w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-white/15 bg-white/[0.02] px-4 py-3 text-[11px] font-medium text-white/35 transition-[border-color,background-color,color] duration-200 ease-out-expo fine-hover:hover:border-white/25 fine-hover:hover:text-white/55 fine-hover:hover:bg-white/[0.04] active:scale-[0.99] ${
                    refZoneShake ? 'animate-[nodewow-shake_0.45s_ease-in-out]' : ''
                  }`}
                >
                  <ImagePlus className="h-4 w-4" />
                  {refFiles.length > 0
                    ? `${refFiles.length} reference${refFiles.length > 1 ? 's' : ''} — add more or drag & drop`
                    : 'Add reference images (optional) — drag & drop or click'}
                </button>
              </div>

              <div className="mt-5">
                <div
                  id="nodewow-hero-resolution-label"
                  className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[3px] text-white/45"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff5b00]" aria-hidden />
                  Resolution
                </div>
                <div
                  role="group"
                  aria-labelledby="nodewow-hero-resolution-label"
                  className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                >
                  {(
                    [
                      { value: '1K', label: 'HD', dim: '1920×1080', note: 'Fastest' },
                      { value: '2K', label: '2K', dim: '2560×1440', note: 'Balanced' },
                      { value: '4K', label: '4K', dim: '3840×2160', note: 'Highest detail' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setImageSize(opt.value)}
                      className={`rounded-[14px] border px-3 py-3 text-left transition-[transform,border-color,background-color,box-shadow] duration-150 ease-out-expo active:scale-[0.99] ${
                        imageSize === opt.value
                          ? 'border-[#ff5b00]/50 bg-[#ff5b00]/10 shadow-[0_0_16px_rgba(255,91,0,0.12)]'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="text-[12px] font-black uppercase tracking-wider text-white">
                        {opt.label}
                      </div>
                      <div className="mt-0.5 text-[11px] text-white/40">{opt.dim}</div>
                      <div className="mt-1 text-[10px] text-white/30">{opt.note}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex flex-col items-end gap-1">
                <Button
                  type="submit"
                  disabled={!prompt.trim() || prompt.length > PROMPT_MAX}
                  size="lg"
                  aria-label="Generate frames from your prompt"
                >
                  <Send className="h-4 w-4" />
                  Generate Frames
                </Button>
                <span className="text-[10px] text-white/25">
                  ⌘ Enter to generate
                </span>
              </div>
                </form>
              </div>
            </div>
          </Panel>
        )}

        {/* ── Running / complete status (top-right: avoids covering logo + history) ── */}
        {!isIdle && (
          <Panel
            position="top-right"
            className="z-10 mt-3 mr-3 w-[min(380px,calc(100vw-1.25rem))]"
          >
            <div className="overflow-hidden rounded-[14px] border border-[#1a1a1a] bg-[#0d0d0d]/90 shadow-xl backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-3 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {status === 'orchestrating' && (
                    <>
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff5b00] opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff5b00]" />
                      </span>
                      <span className="truncate text-xs text-white/50">Analyzing scenes…</span>
                    </>
                  )}
                  {status === 'generating' && (
                    <>
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff5b00] opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff5b00]" />
                      </span>
                      <span className="min-w-0 truncate text-xs text-white/50">
                        Generating… {completedCount}/{totalFrames}
                      </span>
                    </>
                  )}
                  {status === 'complete' && (
                    <>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      <span className="truncate text-xs text-emerald-400">
                        {completedCount} frames done
                      </span>
                    </>
                  )}
                  {status === 'failed' && (
                    <>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                      <span className="truncate text-xs text-red-400">Generation failed</span>
                    </>
                  )}
                  {status === 'killed' && (
                    <>
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                      <span className="truncate text-xs text-amber-400">
                        Stopped {completedCount}/{totalFrames}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 text-[10px] tabular-nums text-white/40">
                  <span>{formatDur(elapsedMs)}</span>
                  {etaLabel && <span className="max-w-[4.5rem] truncate text-white/45">{etaLabel}</span>}
                  {fpsLabel && (
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/55">
                      {fpsLabel}
                    </span>
                  )}
                </div>
              </div>
              <div className="h-0.5 w-full bg-white/[0.06]">
                <div
                  className="h-full bg-gradient-to-r from-[#ff5b00] to-[#ff8c00] transition-[width] duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1 border-t border-white/[0.06] px-2 py-1.5">
                {(status === 'orchestrating' || status === 'generating') && !isViewing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleKill}
                    className="!text-red-400 hover:!bg-red-500/10"
                  >
                    <OctagonX className="h-3.5 w-3.5" />
                    Stop
                  </Button>
                )}
                {(status === 'failed' || status === 'killed') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRetry}
                    className="!text-[#ff5b00] hover:!bg-[#ff5b00]/10"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry Failed
                  </Button>
                )}
                {(status === 'complete' || status === 'killed') && completedCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const id = runIdRef.current || (typeof loadRunId === 'string' ? loadRunId : null);
                      if (id) {
                        const a = document.createElement('a');
                        a.href = `${API_URL}/api/runs/${id}/download`;
                        a.download = '';
                        a.click();
                        pushToast({ kind: 'success', message: 'Frames downloaded' });
                      }
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download All
                  </Button>
                )}
                {!isViewing && (
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    New
                  </Button>
                )}
                {isViewing && (
                  <Link href="/">
                    <Button variant="ghost" size="sm">
                      <Plus className="h-3.5 w-3.5" />
                      New
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </Panel>
        )}
        {!ghostMode && graphStats.frames > 0 && (
          <Panel position="bottom-center" className="mb-8">
            <div className="rounded-full border border-white/[0.06] bg-[#0a0a0a]/90 px-5 py-2 text-[11px] text-white/40 shadow-lg backdrop-blur-md">
              <span className="text-white/50">{graphStats.scenes}</span> scenes
              <span className="mx-2 text-white/15">·</span>
              <span className="text-white/50">{graphStats.frames}</span> frames
              <span className="mx-2 text-white/15">·</span>
              <span className="text-[#ff5b00]/80">{graphStats.generating}</span> generating
              <span className="mx-2 text-white/15">·</span>
              <span className="text-emerald-400/70">{graphStats.complete}</span> complete
              <span className="mx-2 text-white/15">·</span>
              <span className="text-red-400/70">{graphStats.failed}</span> failed
            </div>
          </Panel>
        )}
        {!ghostMode && (
          <Panel position="bottom-left" className="mb-6 ml-2 flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={() => setShowShortcuts((s) => !s)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-[#0d0d0d]/90 text-white/50 shadow-lg backdrop-blur-xl transition-colors hover:border-[#ff5b00]/30 hover:text-white/85"
              aria-label="Keyboard shortcuts"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            {showShortcuts && (
              <div
                ref={shortcutsRef}
                className="w-[min(280px,calc(100vw-3rem))] rounded-xl border border-white/[0.1] bg-[#0d0d0d]/95 p-4 text-[11px] leading-relaxed text-white/55 shadow-2xl backdrop-blur-xl animate-in"
              >
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">
                  Canvas shortcuts
                </p>
                <ul className="space-y-1.5">
                  <li>
                    <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                      Space
                    </kbd>{' '}
                    — pan mode
                  </li>
                  <li>
                    <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                      F
                    </kbd>{' '}
                    — fit view
                  </li>
                  <li>
                    <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                      ←
                    </kbd>{' '}
                    <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                      →
                    </kbd>{' '}
                    — navigate frames (lightbox)
                  </li>
                  <li>
                    <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                      Esc
                    </kbd>{' '}
                    — close modal
                  </li>
                </ul>
              </div>
            )}
          </Panel>
        )}
      </ReactFlow>

      {/* ── Image Lightbox ── */}
      {lightboxImages && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          startIndex={lightboxIndex}
          onClose={() => setLightboxImages(null)}
        />
      )}

      {/* ── Prompt Viewer Modal ── */}
      {promptModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-xl motion-modal-backdrop"
            onClick={() => setPromptModal(null)}
          />
          <div className="motion-modal-panel relative z-10 mx-4 max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0d0d] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <ScrollText className="h-4 w-4 text-[#ff5b00]" />
                <span className="text-[12px] font-bold uppercase tracking-widest text-white/60">
                  Full Prompt
                </span>
              </div>
              <button
                onClick={() => setPromptModal(null)}
                className="rounded-xl p-2 text-white/30 transition-[transform,background-color,color] duration-150 ease-out-expo hover:bg-white/5 hover:text-white/60 active:scale-[0.97]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto p-6">
              <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-white/70">
                {promptModal}
              </pre>
            </div>
            <div className="border-t border-white/5 px-6 py-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(promptModal);
                }}
                className="rounded-[12px] bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white/40 transition-[transform,background-color,color] duration-150 ease-out-expo hover:bg-white/10 hover:text-white/60 active:scale-[0.98]"
              >
                Copy to clipboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Video Player Modal ── */}
      {videoPlayer && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-xl motion-modal-backdrop"
            onClick={() => setVideoPlayer(null)}
          />
          <div className="motion-modal-panel relative z-10 mx-4 w-full max-w-3xl overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0d0d] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <ImagePlay className="h-4 w-4 text-purple-400" />
                <span className="text-[12px] font-bold uppercase tracking-widest text-white/60">
                  Generated Video
                </span>
              </div>
              <button
                onClick={() => setVideoPlayer(null)}
                className="rounded-xl p-2 text-white/30 transition-[transform,background-color,color] duration-150 ease-out-expo hover:bg-white/5 hover:text-white/60 active:scale-[0.97]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <video
                src={`${API_URL}${videoPlayer.videoUrl}`}
                controls
                autoPlay
                loop
                className="w-full rounded-[16px] bg-black"
              />
            </div>
            {videoPlayer.motionPrompt && (
              <div className="border-t border-white/5 px-6 py-4">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-purple-400/60">
                  Motion Prompt (AI-generated)
                </p>
                <p className="text-[12px] leading-relaxed text-white/50">
                  {videoPlayer.motionPrompt}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
