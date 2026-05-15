'use client';

import { memo, useCallback, useEffect, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Loader2, AlertCircle, Play, MonitorPlay, Download, RefreshCw } from 'lucide-react';

import { API_URL } from '@/lib/apiBase';
import { rfHandleTopStyle } from './handleInset';

interface Data {
  videoStatus: 'idle' | 'generating' | 'ready' | 'failed';
  videoUrl?: string;
  motionPrompt?: string;
  parentPrompt?: string;
  frameIndex: number;
  /** Matches frame node badge (run-wide order). */
  frameNumber?: number;
  error?: string;
}

const R = 36;
const C = 2 * Math.PI * R;

function Node({ id, data }: { id: string; data: Data }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const parentFrameId = id.startsWith('video-') ? id.slice('video-'.length) : id;

  const handlePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!data.videoUrl) return;
      document.dispatchEvent(
        new CustomEvent('nodewow:play-video', {
          detail: {
            frameId: parentFrameId,
            videoUrl: data.videoUrl,
            motionPrompt: data.motionPrompt,
            prompt: data.parentPrompt,
          },
        }),
      );
    },
    [parentFrameId, data.videoUrl, data.motionPrompt, data.parentPrompt],
  );

  const handleRetryVideo = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent('nodewow:generate-video', { detail: { frameId: parentFrameId } }),
      );
    },
    [parentFrameId],
  );

  useEffect(() => {
    const el = wrapRef.current;
    const vid = videoRef.current;
    if (!el || !vid || data.videoStatus !== 'ready') return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) void vid.play().catch(() => {});
          else {
            vid.pause();
            vid.currentTime = 0;
          }
        }
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [data.videoStatus]);

  return (
    <div
      className={`group relative w-[240px] overflow-visible rounded-[18px] border bg-[#0d0d0d] pb-4 shadow-xl transition-[border-color,box-shadow] duration-200 ease-out-expo ${
        data.videoStatus === 'ready'
          ? 'border-purple-500/30 hover:border-purple-400/50'
          : data.videoStatus === 'failed'
            ? 'border-red-500/20'
            : 'border-purple-500/20 shadow-[0_0_24px_rgba(168,85,247,0.06)]'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="!z-30 !h-2 !w-2 !border-[#1a1a1a] !bg-purple-500"
        style={rfHandleTopStyle}
      />

      <div ref={wrapRef} className="relative mt-4 aspect-video overflow-hidden rounded-t-[18px]">
        {data.videoStatus === 'generating' && (
          <div className="absolute inset-0 flex flex-col items-center overflow-hidden bg-black/75 px-3 py-5">
            <div className="relative flex h-[88px] w-[88px] shrink-0 items-center justify-center">
              <svg
                key={`${id}-generating-ring`}
                className="absolute inset-0 m-auto h-[88px] w-[88px] -rotate-90"
                viewBox="0 0 88 88"
                aria-hidden
              >
                <circle
                  cx="44"
                  cy="44"
                  r={R}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="6"
                />
                <circle
                  cx="44"
                  cy="44"
                  r={R}
                  fill="none"
                  stroke={`url(#vg-${id})`}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  className="animate-[video-ring-sweep_180s_linear_forwards]"
                />
                <defs>
                  <linearGradient id={`vg-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#c084fc" />
                  </linearGradient>
                </defs>
              </svg>
              <Loader2 className="relative z-10 h-6 w-6 animate-spin text-purple-300/90" />
            </div>
            <div className="mt-5 flex w-full max-w-[200px] flex-col items-center gap-2 text-center">
              <span className="text-[9px] font-bold uppercase tracking-[3px] text-purple-400/70">
                Generating Video
              </span>
              <span className="text-[9px] leading-snug text-white/35">
                ~3 min estimate — Veo may take 2–5 min
              </span>
            </div>
          </div>
        )}

        {data.videoStatus === 'ready' && data.videoUrl && (
          <div className="relative h-full w-full cursor-pointer" onClick={handlePlay}>
            <video
              ref={videoRef}
              src={`${API_URL}${data.videoUrl}`}
              muted
              loop
              playsInline
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-[background-color] duration-200 ease-out-expo group-hover:bg-black/30">
              <div className="flex scale-[0.98] items-center gap-1.5 rounded-full bg-purple-500/80 px-3 py-1.5 opacity-0 backdrop-blur-sm transition-[opacity,transform] duration-200 ease-out-expo group-hover:scale-100 group-hover:opacity-100">
                <Play className="h-3 w-3 fill-white text-white" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white">Play</span>
              </div>
            </div>
            <a
              href={`${API_URL}${data.videoUrl}`}
              download={`nodewow-frame-${data.frameIndex + 1}.mp4`}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/70 backdrop-blur-sm transition-colors hover:border-purple-400/40 hover:text-white"
              title="Download MP4"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
        )}

        {data.videoStatus === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-3 py-6">
            <AlertCircle className="h-5 w-5 text-red-400/80" />
            <span className="text-[9px] font-bold uppercase tracking-[3px] text-red-400/50">
              Video Failed
            </span>
            <button
              type="button"
              onClick={handleRetryVideo}
              className="mt-1 flex items-center gap-1.5 rounded-lg border border-purple-500/35 bg-purple-500/15 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-purple-200 transition-colors hover:bg-purple-500/25"
              title="Regenerate motion prompt and retry video"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry video
            </button>
          </div>
        )}
      </div>

      <div className="rounded-b-[18px] border-t border-white/[0.06] px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <MonitorPlay className="h-3 w-3 text-purple-400/60" />
            <span className="text-[10px] font-bold uppercase tracking-[2px] text-purple-400/50">
              Video {data.frameNumber ?? data.frameIndex + 1}
            </span>
          </div>
          {data.videoStatus === 'generating' && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-400" />
          )}
          {data.videoStatus === 'ready' && (
            <button
              type="button"
              onClick={handlePlay}
              className="rounded-md px-1.5 py-0.5 text-purple-400/40 transition-[transform,background-color,color] duration-150 ease-out-expo hover:bg-purple-500/10 hover:text-purple-400 active:scale-[0.97]"
              title="Play video"
            >
              <Play className="h-3 w-3" />
            </button>
          )}
        </div>
        {data.motionPrompt && (
          <p className="mt-2 line-clamp-2 text-[11px] leading-[1.6] text-white/35 transition-[color] duration-200 ease-out group-hover:text-white/50">
            {data.motionPrompt}
          </p>
        )}
        {data.videoStatus === 'failed' && data.error && (
          <p className="mt-2 line-clamp-2 text-[11px] leading-[1.6] text-red-400/50">{data.error}</p>
        )}
      </div>
    </div>
  );
}

export const VideoNode = memo(Node);
