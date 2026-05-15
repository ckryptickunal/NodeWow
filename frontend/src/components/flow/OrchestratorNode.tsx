'use client';

import { memo, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Workflow, Loader2, AlertCircle } from 'lucide-react';

import { rfHandleBottomStyle, rfHandleTopStyle } from './handleInset';

interface Data {
  status: 'analyzing' | 'complete' | 'failed';
  sceneCount?: number;
  frameCount?: number;
  error?: string;
}

const THINKING_LINES = [
  'Mapping scene boundaries…',
  'Balancing pacing across beats…',
  'Locking camera grammar per scene…',
  'Drafting parallel frame prompts…',
];

function ThinkingBlock() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setPhase((p) => (p + 1) % THINKING_LINES.length), 2200);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-[#ff5b00]" />
        <span className="text-sm text-white/50">Orchestrating plan…</span>
      </div>
      <div className="relative h-[64px] overflow-hidden rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-white/35">
        {THINKING_LINES.map((line, i) => (
          <p
            key={line}
            className="transition-opacity duration-500"
            style={{ opacity: i === phase ? 0.9 : 0.2 }}
          >
            ▸ {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function Node({ data }: { data: Data }) {
  return (
    <div className="relative w-[320px] overflow-visible rounded-[18px] border border-[#1a1a1a] bg-[#0d0d0d] px-4 pb-4 pt-5 shadow-xl">
      <Handle
        type="target"
        position={Position.Top}
        className="!z-30 !h-2 !w-2 !border-[#1a1a1a] !bg-[#ff5b00]"
        style={rfHandleTopStyle}
      />

      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ff5b00]/10">
          <Workflow className="h-3.5 w-3.5 text-[#ff5b00]" />
        </div>
        <span className="text-[11px] font-black uppercase tracking-[3px] text-white/60">
          Scene Analyzer
        </span>
      </div>

      {data.status === 'analyzing' && <ThinkingBlock />}

      {data.status === 'complete' && (
        <div className="flex justify-center gap-16">
          <div className="text-center">
            <div className="text-xl font-bold tabular-nums text-white">{data.sceneCount}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-widest text-white/40">Scenes</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold tabular-nums text-[#ff5b00]">{data.frameCount}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-widest text-white/40">Frames</div>
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
        className="!z-30 !h-2 !w-2 !border-[#1a1a1a] !bg-[#ff5b00]"
        style={rfHandleBottomStyle}
      />
    </div>
  );
}

export const OrchestratorNode = memo(Node);
