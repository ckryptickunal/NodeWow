'use client';

import { memo, useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Loader2, AlertCircle, CheckCircle2, Maximize2, FileText } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Data {
  status: 'queued' | 'generating' | 'complete' | 'failed';
  prompt: string;
  frameIndex: number;
  assetUrl?: string;
  thumbUrl?: string;
  error?: string;
}

const borderMap: Record<string, string> = {
  queued: 'border-white/[0.06]',
  generating: 'border-[#ff5b00]/40 shadow-[0_0_24px_rgba(255,91,0,0.08)]',
  complete: 'border-white/[0.08] hover:border-[#ff5b00]/30',
  failed: 'border-red-500/20',
};

function Node({ id, data }: { id: string; data: Data }) {
  const [imgLoaded, setImgLoaded] = useState(false);

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
          },
        }),
      );
    },
    [id, data],
  );

  const handleViewPrompt = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent('nodewow:view-prompt', { detail: { prompt: data.prompt } }),
      );
    },
    [data.prompt],
  );

  const displayUrl = data.thumbUrl
    ? `${API_URL}${data.thumbUrl}`
    : data.assetUrl
      ? `${API_URL}${data.assetUrl}`
      : undefined;

  return (
    <div
      className={`group w-[240px] overflow-hidden rounded-[18px] border bg-[#0d0d0d] shadow-xl transition-all duration-300 ${borderMap[data.status]}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-[#1a1a1a] !bg-[#ff5b00]"
      />

      {/* Image area — 16:9 */}
      <div
        className={`relative aspect-video overflow-hidden ${
          data.status === 'complete' && data.assetUrl ? 'cursor-pointer' : ''
        }`}
        onClick={handleImageClick}
      >
        {/* Queued skeleton shimmer */}
        {data.status === 'queued' && (
          <div className="absolute inset-0 overflow-hidden bg-black/60">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="h-6 w-6 rounded-full border border-white/10 bg-white/[0.03]" />
              <span className="text-[9px] font-bold uppercase tracking-[3px] text-white/15">
                Queued
              </span>
            </div>
          </div>
        )}

        {/* Generating pulse */}
        {data.status === 'generating' && (
          <div className="absolute inset-0 overflow-hidden bg-black/60">
            <div className="absolute inset-0 animate-pulse bg-gradient-to-t from-[#ff5b00]/[0.04] to-transparent" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-[#ff5b00]" />
              <span className="text-[9px] font-bold uppercase tracking-[3px] text-[#ff5b00]/50">
                Generating
              </span>
            </div>
          </div>
        )}

        {/* Completed image with thumbnail */}
        {data.status === 'complete' && displayUrl && (
          <>
            {/* Skeleton behind while loading */}
            {!imgLoaded && (
              <div className="absolute inset-0 overflow-hidden bg-black/60">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
              </div>
            )}

            <img
              src={displayUrl}
              alt={`Frame ${data.frameIndex + 1}`}
              className={`h-full w-full object-cover transition-all duration-500 ${
                imgLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
              }`}
              onLoad={() => setImgLoaded(true)}
              loading="lazy"
              draggable={false}
            />

            {/* Hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/40">
              <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 opacity-0 backdrop-blur-sm transition-all duration-200 group-hover:opacity-100 scale-90 group-hover:scale-100">
                <Maximize2 className="h-3 w-3 text-white/80" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">
                  View
                </span>
              </div>
            </div>

            {/* Status pip */}
            <div className="absolute right-2 top-2 opacity-80 transition-opacity group-hover:opacity-100">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]" />
            </div>
          </>
        )}

        {/* Complete but no asset */}
        {data.status === 'complete' && !data.assetUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <CheckCircle2 className="h-5 w-5 text-emerald-400/40" />
          </div>
        )}

        {/* Failed */}
        {data.status === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
            <AlertCircle className="h-5 w-5 text-red-400/80" />
            <span className="text-[9px] font-bold uppercase tracking-[3px] text-red-400/50">
              Failed
            </span>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="px-3.5 py-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[2px] text-white/30">
            Frame {data.frameIndex + 1}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleViewPrompt}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-white/20 transition-colors hover:bg-white/5 hover:text-white/50"
              title="View full prompt"
            >
              <FileText className="h-3 w-3" />
            </button>
            {data.status === 'generating' && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5b00] animate-pulse" />
            )}
          </div>
        </div>
        <p className="line-clamp-2 text-[11px] leading-[1.6] text-white/40 group-hover:text-white/55 transition-colors">
          {data.status === 'failed' ? data.error || 'Generation failed' : data.prompt}
        </p>
      </div>
    </div>
  );
}

export const FrameNode = memo(Node);
