'use client';

import { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileText, Maximize2, OctagonX } from 'lucide-react';

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
    <div className="w-[340px] rounded-[20px] border border-[#1a1a1a] bg-[#0d0d0d] p-5 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ff5b00]/10">
            <FileText className="h-3.5 w-3.5 text-[#ff5b00]" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-[3px] text-white/60">
            Input Prompt
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleViewPrompt}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-white/25 transition-colors hover:bg-white/5 hover:text-white/60"
            title="View full prompt"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          {isActive && (
            <button
              onClick={handleKill}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-red-400/40 transition-colors hover:bg-red-500/10 hover:text-red-400"
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
        className="!h-2 !w-2 !border-[#1a1a1a] !bg-[#ff5b00]"
      />
    </div>
  );
}

export const CollatedPromptNode = memo(Node);
