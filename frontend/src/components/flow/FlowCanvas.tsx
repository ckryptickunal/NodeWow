'use client';

import {
  useState,
  useCallback,
  useRef,
  useEffect,
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
  Sparkles,
  RotateCcw,
  Layers,
  History,
  ImagePlus,
  X,
  OctagonX,
  FileText,
  Download,
  RefreshCw,
} from 'lucide-react';

import { CollatedPromptNode } from './CollatedPromptNode';
import { OrchestratorNode } from './OrchestratorNode';
import { SceneGroupNode } from './SceneGroupNode';
import { FrameNode } from './FrameNode';
import { Button } from '@/components/ui/Button';
import { ImageLightbox, type LightboxImage } from '@/components/ui/ImageLightbox';
import { layoutGraph } from '@/lib/layout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const nodeTypes = {
  collatedPrompt: CollatedPromptNode,
  orchestrator: OrchestratorNode,
  sceneGroup: SceneGroupNode,
  frame: FrameNode,
};

const edgeStyle = { stroke: '#333', strokeWidth: 1.5 };

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

interface Props {
  loadRunId?: string;
}

/* ── helpers to build a full graph from a plan ── */

function buildNodes(
  promptText: string,
  plan: Plan,
  frameOverrides?: Record<string, { status: string; assetUrl?: string; thumbUrl?: string; error?: string }>,
): Node[] {
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
    ...plan.scenes.map((s) => ({
      id: s.sceneId,
      type: 'sceneGroup' as const,
      position: { x: 0, y: 0 },
      data: { title: s.title, summary: s.summary },
    })),
    ...plan.frames.map((f) => {
      const over = frameOverrides?.[f.id];
      return {
        id: f.id,
        type: 'frame' as const,
        position: { x: 0, y: 0 },
        data: {
          status: over?.status ?? 'queued',
          prompt: f.prompt,
          frameIndex: f.frameIndex,
          assetUrl: over?.assetUrl,
          thumbUrl: over?.thumbUrl,
          error: over?.error,
        },
      };
    }),
  ];
}

function buildEdges(plan: Plan): Edge[] {
  return [
    {
      id: 'e-input-orch',
      source: 'input',
      target: 'orchestrator',
      style: { stroke: '#ff5b00', strokeWidth: 2 },
    },
    ...plan.scenes.map((s) => ({
      id: `e-orch-${s.sceneId}`,
      source: 'orchestrator',
      target: s.sceneId,
      style: edgeStyle,
    })),
    ...plan.frames.map((f) => ({
      id: `e-${f.sceneId}-${f.id}`,
      source: f.sceneId,
      target: f.id,
      style: edgeStyle,
    })),
  ];
}

export default function FlowCanvas({ loadRunId }: Props) {
  const [status, setStatus] = useState<RunStatus>('idle');
  const [prompt, setPrompt] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const { fitView } = useReactFlow();
  const esRef = useRef<EventSource | null>(null);
  const promptRef = useRef('');
  const runIdRef = useRef<string | null>(null);
  const [promptModal, setPromptModal] = useState<string | null>(null);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [refPreviews, setRefPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

        const allNodes = buildNodes(data.prompt, plan, data.frames);
        const allEdges = buildEdges(plan);

        const laidOut = await layoutGraph(allNodes, allEdges);
        setNodes(laidOut);
        setEdges(allEdges);

        if (data.status === 'complete') {
          setStatus('complete');
        } else if (data.status === 'failed') {
          setStatus('failed');
        } else {
          setStatus('generating');
          const es = new EventSource(`${API_URL}/api/runs/${runId}/events`);
          esRef.current = es;
          es.onmessage = (ev) => {
            try { handleSSE(JSON.parse(ev.data)); } catch { /* skip */ }
          };
          es.onerror = () => es.close();
        }

        setTimeout(() => fitView({ padding: 0.15, duration: 800 }), 200);
      } catch { /* network error */ }
    },
    [setNodes, setEdges, fitView],
  );

  useEffect(() => {
    if (loadRunId) loadPreviousRun(loadRunId);
  }, [loadRunId, loadPreviousRun]);

  /* ── SSE event dispatcher ── */
  const handleSSE = useCallback(
    async (event: { type: string; data: Record<string, unknown> }) => {
      switch (event.type) {
        case 'plan_ready': {
          const plan = event.data.plan as Plan;
          setStatus('generating');
          setTotalFrames(plan.totalFrames);

          const allNodes = buildNodes(promptRef.current, plan);
          const allEdges = buildEdges(plan);

          const laidOut = await layoutGraph(allNodes, allEdges);
          setNodes(laidOut);
          setEdges(allEdges);
          setTimeout(() => fitView({ padding: 0.15, duration: 800 }), 200);
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

        case 'frame_done':
          setCompletedCount((c) => c + 1);
          setNodes((nds) =>
            nds.map((n) =>
              n.id === (event.data.frameId as string)
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      status: 'complete',
                      assetUrl: event.data.assetUrl as string,
                      thumbUrl: (event.data.thumbUrl as string) ?? undefined,
                    },
                  }
                : n,
            ),
          );
          break;

        case 'frame_failed':
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

        case 'run_complete':
          setStatus('complete');
          esRef.current?.close();
          break;

        case 'orchestrator_failed':
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
          setStatus('killed');
          esRef.current?.close();
          break;
      }
    },
    [setNodes, setEdges, fitView],
  );

  /* ── Submit ── */
  const handleGenerate = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const text = prompt.trim();
      if (!text) return;
      promptRef.current = text;
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
          for (const file of refFiles) {
            fd.append('references', file);
          }
          res = await fetch(`${API_URL}/api/runs`, { method: 'POST', body: fd });
        } else {
          res = await fetch(`${API_URL}/api/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collatedPrompt: text }),
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
    [prompt, refFiles, handleSSE, setNodes, setEdges, fitView],
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
    runIdRef.current = null;
  }, [setNodes, setEdges]);

  const handleKill = useCallback(async () => {
    const id = runIdRef.current;
    if (!id) return;
    try {
      await fetch(`${API_URL}/api/runs/${id}/kill`, { method: 'POST' });
    } catch { /* network error — still close locally */ }
    esRef.current?.close();
    setStatus('killed');
  }, []);

  useEffect(() => {
    const handler = () => { handleKill(); };
    document.addEventListener('nodewow:kill-run', handler);
    return () => document.removeEventListener('nodewow:kill-run', handler);
  }, [handleKill]);

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

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.05}
        maxZoom={2}
        className="bg-[#121212]"
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#1e1e1e"
        />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={() => '#333'}
          maskColor="rgba(0,0,0,0.7)"
          pannable
          zoomable
        />

        {/* ── Brand header ── */}
        <Panel position="top-left">
          <div className="flex items-center gap-3">
            <Link href="/">
              <div className="flex items-center gap-2.5 rounded-[16px] bg-[#0d0d0d]/80 backdrop-blur-xl border border-[#1a1a1a] px-5 py-3 shadow-2xl hover:border-[#ff5b00]/20 transition-colors cursor-pointer">
                <Layers className="h-5 w-5 text-[#ff5b00]" />
                <span className="font-display text-lg font-black uppercase tracking-[4px] text-white">
                  Node<span className="text-[#ff5b00]">Wow</span>
                </span>
              </div>
            </Link>
            <Link href="/history">
              <div className="flex items-center gap-2 rounded-[16px] bg-[#0d0d0d]/80 backdrop-blur-xl border border-[#1a1a1a] px-4 py-3 shadow-2xl hover:border-[#ff5b00]/20 transition-colors cursor-pointer">
                <History className="h-4 w-4 text-white/50" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-white/50">
                  History
                </span>
              </div>
            </Link>
          </div>
        </Panel>

        {/* ── Idle: hero input (only on main page, not when viewing a past run) ── */}
        {isIdle && (
          <Panel position="top-center" className="!top-1/2 !-translate-y-1/2">
            <form
              onSubmit={handleGenerate}
              className="w-[580px] max-w-[92vw] rounded-[32px] border border-[#1a1a1a] bg-[#0d0d0d] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ff5b00]/10">
                  <Sparkles className="h-4 w-4 text-[#ff5b00]" />
                </div>
                <div>
                  <h1 className="font-display text-xl font-black uppercase tracking-[3px] text-white">
                    Scene Generator
                  </h1>
                  <p className="mt-0.5 text-[11px] text-white/30">
                    Describe multiple scenes — they&#39;ll be analyzed and generated in parallel
                  </p>
                </div>
              </div>

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A sunrise over a misty mountain range with golden light filtering through pine trees. A medieval castle courtyard during a rainstorm with torches flickering..."
                rows={6}
                className="w-full resize-none rounded-[20px] border border-white/5 bg-black/40 px-6 py-4 text-[13px] leading-relaxed text-white/90 placeholder:text-white/15 focus:border-[#ff5b00]/30 focus:outline-none focus:ring-2 focus:ring-[#ff5b00]/10 transition-all duration-300"
              />

              {/* Reference images */}
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
                          alt={`Ref ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeReference(i)}
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-white opacity-0 transition-opacity group-hover/ref:opacity-100 shadow-lg"
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
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-[#ff5b00]/40'); }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove('border-[#ff5b00]/40'); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-[#ff5b00]/40');
                    if (e.dataTransfer.files) addReferenceFiles(e.dataTransfer.files);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-[11px] font-medium text-white/30 transition-all hover:border-white/20 hover:text-white/50 hover:bg-white/[0.04]"
                >
                  <ImagePlus className="h-4 w-4" />
                  {refFiles.length > 0
                    ? `${refFiles.length} reference${refFiles.length > 1 ? 's' : ''} — add more or drag & drop`
                    : 'Add reference images (optional) — drag & drop or click'}
                </button>
              </div>

              <div className="mt-5 flex justify-end">
                <Button type="submit" disabled={!prompt.trim()} size="lg">
                  <Send className="h-4 w-4" />
                  Generate Frames
                </Button>
              </div>
            </form>
          </Panel>
        )}

        {/* ── Running / complete status bar ── */}
        {!isIdle && (
          <Panel position="top-center">
            <div className="flex items-center gap-4 rounded-[20px] border border-[#1a1a1a] bg-[#0d0d0d]/90 px-6 py-3 shadow-2xl backdrop-blur-xl">
              {status === 'orchestrating' && (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff5b00] opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ff5b00]" />
                  </span>
                  <span className="text-sm text-white/50">
                    Analyzing scenes…
                  </span>
                </>
              )}
              {status === 'generating' && (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff5b00] opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ff5b00]" />
                  </span>
                  <span className="text-sm text-white/50">
                    Generating frames… {completedCount}/{totalFrames}
                  </span>
                </>
              )}
              {status === 'complete' && (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-sm text-emerald-400">
                    {completedCount} frames generated
                  </span>
                </>
              )}
              {status === 'failed' && (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span className="text-sm text-red-400">
                    Generation failed
                  </span>
                </>
              )}
              {status === 'killed' && (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="text-sm text-amber-400">
                    Stopped — {completedCount} of {totalFrames} generated
                  </span>
                </>
              )}
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
                    <Sparkles className="h-3.5 w-3.5" />
                    New
                  </Button>
                </Link>
              )}
            </div>
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
            className="absolute inset-0 bg-black/70 backdrop-blur-xl animate-in"
            onClick={() => setPromptModal(null)}
          />
          <div className="relative z-10 mx-4 max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0d0d] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 text-[#ff5b00]" />
                <span className="text-[12px] font-bold uppercase tracking-widest text-white/60">
                  Full Prompt
                </span>
              </div>
              <button
                onClick={() => setPromptModal(null)}
                className="rounded-xl p-2 text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
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
                className="rounded-[12px] bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white/40 transition-colors hover:bg-white/10 hover:text-white/60"
              >
                Copy to clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
