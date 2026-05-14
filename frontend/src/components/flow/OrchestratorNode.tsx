'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';

interface Data {
  status: 'analyzing' | 'complete' | 'failed';
  sceneCount?: number;
  frameCount?: number;
  error?: string;
}

function Node({ data }: { data: Data }) {
  return (
    <div className="w-[320px] rounded-[20px] border border-[#1a1a1a] bg-[#0d0d0d] p-5 shadow-2xl">
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-[#1a1a1a] !bg-[#ff5b00]"
      />

      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ff5b00]/10">
          <Sparkles className="h-3.5 w-3.5 text-[#ff5b00]" />
        </div>
        <span className="text-[11px] font-black uppercase tracking-[3px] text-white/60">
          Scene Analyzer
        </span>
      </div>

      {data.status === 'analyzing' && (
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-4 w-4 animate-spin text-[#ff5b00]" />
          <span className="text-sm text-white/50">Analyzing scenes…</span>
        </div>
      )}

      {data.status === 'complete' && (
        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">
              {data.sceneCount}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-widest text-white/40">
              Scenes
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[#ff5b00]">
              {data.frameCount}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-widest text-white/40">
              Frames
            </div>
          </div>
        </div>
      )}

      {data.status === 'failed' && (
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{data.error}</p>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-[#1a1a1a] !bg-[#ff5b00]"
      />
    </div>
  );
}

export const OrchestratorNode = memo(Node);
