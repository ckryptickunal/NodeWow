'use client';

import { memo, useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Loader2, AlertCircle, CheckCircle2, Maximize2, ImagePlay, RefreshCw } from 'lucide-react';

import { API_URL } from '@/lib/apiBase';
import { rfHandleBottomStyle, rfHandleTopStyle } from './handleInset';

interface Data {
  status: 'queued' | 'generating' | 'complete' | 'failed';
  prompt: string;
  frameIndex: number;
  sceneId?: string;
  sceneColor?: string;
  /** 1-based index across the whole run (scene order, then frameIndex). */
  frameNumber?: number;
  assetUrl?: string;
  thumbUrl?: string;
  error?: string;
  videoStatus?: 'idle' | 'generating' | 'ready' | 'failed';
  videoUrl?: string;
  motionPrompt?: string;
}

const borderMap: Record<string, string> = {
  queued: 'border-white/[0.06]',
  generating: 'border-[#ff5b00]/40 shadow-[0_0_24px_rgba(255,91,0,0.08)]',
  complete: 'border-white/[0.08] hover:border-[#ff5b00]/30',
  failed: 'border-red-500/20',
};

function Node({ id, data }: { id: string; data: Data }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const sceneColor = data.sceneColor ?? '#ff5b00';
  const ord = data.frameNumber ?? data.frameIndex + 1;

  const handleImageClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (data.status !== 'complete' || !data.assetUrl) return;
      document.dispatchEvent(
        new CustomEvent('nodewow:view-image', {
          detail: {
            frameId: id,
            assetUrl: data.assetUrl,
            thumbUrl: data.thumbUrl,
            prompt: data.prompt,
            frameIndex: data.frameIndex,
            sceneTitle: undefined,
          },
        }),
      );
    },
    [id, data],
  );

  const handleGenerateVideo = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent('nodewow:generate-video', { detail: { frameId: id } }),
      );
    },
    [id],
  );

  const handleRetry = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    document.dispatchEvent(new CustomEvent('nodewow:retry-frame', { detail: { frameId: id } }));
  }, [id]);

  const displayUrl = data.thumbUrl
    ? `${API_URL}${data.thumbUrl}`
    : data.assetUrl
      ? `${API_URL}${data.assetUrl}`
      : undefined;

  return (
    <div
      className={`group relative w-[240px] overflow-visible rounded-[18px] border bg-[#0d0d0d] pb-4 shadow-xl transition-[border-color,box-shadow] duration-200 ease-out-expo ${borderMap[data.status]}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="!z-30 !h-2 !w-2 !border-[#1a1a1a] !bg-[#ff5b00]"
        style={rfHandleTopStyle}
      />

      <div
        className={`relative mt-4 aspect-video overflow-hidden rounded-t-[18px] ${
          data.status === 'complete' && data.assetUrl ? 'cursor-pointer' : ''
        }`}
        onClick={handleImageClick}
      >
        <div
          className="absolute left-2 top-2 z-20 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-black"
          style={{ backgroundColor: sceneColor }}
        >
          F{ord}
        </div>
        {data.status === 'queued' && (
          <div className="absolute inset-0 overflow-hidden bg-black/60">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3 py-6">
              <div className="h-6 w-6 rounded-full border border-white/10 bg-white/[0.03]" />
              <span className="text-[9px] font-bold uppercase tracking-[3px] text-white/15">
                Queued
              </span>
            </div>
          </div>
        )}

        {data.status === 'generating' && (
          <div className="absolute inset-0 overflow-hidden bg-neutral-900">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#ff5b00]/[0.07] to-transparent" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3 py-6">
              <Loader2 className="h-6 w-6 animate-spin text-[#ff5b00]" />
              <span className="text-[9px] font-bold uppercase tracking-[3px] text-[#ff5b00]/50">
                Generating
              </span>
            </div>
          </div>
        )}

        {data.status === 'complete' && displayUrl && (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 overflow-hidden bg-black/60">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
              </div>
            )}

            <img
              key={displayUrl}
              src={displayUrl}
              alt={`Frame ${data.frameIndex + 1}`}
              className={`h-full w-full object-cover transition-[opacity,transform] duration-300 ease-out-expo ${
                imgLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.95]'
              }`}
              onLoad={() => setImgLoaded(true)}
              loading="lazy"
              draggable={false}
            />

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-[opacity,background-color] duration-200 ease-out-expo group-hover:pointer-events-auto group-hover:bg-black/60 group-hover:opacity-100">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleImageClick}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-transform duration-150 ease-out-expo hover:scale-105 active:scale-95"
                  title="Expand"
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={handleGenerateVideo}
                  disabled={(data.videoStatus ?? 'idle') !== 'idle'}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-purple-500/30 text-white transition-transform duration-150 ease-out-expo hover:scale-105 active:scale-95 disabled:opacity-30"
                  title="Generate video"
                >
                  <ImagePlay className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="absolute right-2 top-2 z-10 opacity-80 transition-opacity group-hover:opacity-40">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]" />
            </div>
          </>
        )}

        {data.status === 'complete' && !data.assetUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <CheckCircle2 className="h-5 w-5 text-emerald-400/40" />
          </div>
        )}

        {data.status === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-3 py-6">
            <AlertCircle className="h-5 w-5 text-red-400/80" />
            <span className="text-[9px] font-bold uppercase tracking-[3px] text-red-400/50">
              Failed
            </span>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-1 flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-300 transition-colors hover:bg-red-500/20"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        )}
      </div>

      <div className="rounded-b-[18px] border-t border-white/[0.06] px-3.5 py-3">
        <p className="line-clamp-2 text-[11px] leading-[1.6] text-white/40 group-hover:text-white/55 transition-[color] duration-200 ease-out">
          {data.status === 'failed' ? data.error || 'Generation failed' : data.prompt}
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="source-video"
        className="!z-30 !h-2 !w-2 !border-[#1a1a1a] !bg-purple-500"
        style={rfHandleBottomStyle}
      />
    </div>
  );
}

export const FrameNode = memo(Node);
