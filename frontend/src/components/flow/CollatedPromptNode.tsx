'use client';

import { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ScrollText, Expand, OctagonX } from 'lucide-react';

import { rfHandleBottomStyle } from './handleInset';

interface Data {
  prompt: string;
  status?: string;
}

function Node({ data }: { data: Data }) {
  const isActive = data.status === 'orchestrating' || data.status === 'generating';

  const handleViewPrompt = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent('nodewow:view-prompt', { detail: { prompt: data.prompt } }),
      );
    },
    [data.prompt],
  );

  const handleKill = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    document.dispatchEvent(new CustomEvent('nodewow:kill-run'));
  }, []);

  return (
    <div className="relative w-[340px] overflow-visible rounded-[20px] border border-[#1a1a1a] bg-[#0d0d0d] px-5 pb-6 pt-5 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ff5b00]/10">
            <ScrollText className="h-3.5 w-3.5 text-[#ff5b00]" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-[3px] text-white/60">
            Input Prompt
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleViewPrompt}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-white/25 transition-[transform,background-color,color] duration-150 ease-out-expo hover:bg-white/5 hover:text-white/60 active:scale-[0.97]"
            title="View full prompt"
          >
            <Expand className="h-3.5 w-3.5" />
          </button>
          {isActive && (
            <button
              onClick={handleKill}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-red-400/40 transition-[transform,background-color,color] duration-150 ease-out-expo hover:bg-red-500/10 hover:text-red-400 active:scale-[0.97]"
              title="Stop generation"
            >
              <OctagonX className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className="line-clamp-5 text-[13px] leading-relaxed text-white/70">
        {data.prompt}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!z-30 !h-2 !w-2 !border-[#1a1a1a] !bg-[#ff5b00]"
        style={rfHandleBottomStyle}
      />
    </div>
  );
}

export const CollatedPromptNode = memo(Node);
