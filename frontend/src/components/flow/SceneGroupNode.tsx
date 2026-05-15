'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Clapperboard } from 'lucide-react';

import { rfHandleBottomStyle, rfHandleTopStyle } from './handleInset';

interface Data {
  title: string;
  summary: string;
}

function Node({ data }: { data: Data }) {
  return (
    <div className="relative w-[260px] overflow-visible rounded-[16px] border border-[#1a1a1a] bg-[#0a0a0a] px-4 pb-4 pt-4 shadow-xl">
      <Handle
        type="target"
        position={Position.Top}
        className="!z-30 !h-2 !w-2 !border-[#1a1a1a] !bg-[#ff5b00]"
        style={rfHandleTopStyle}
      />

      <div className="mb-2 flex items-center gap-2">
        <Clapperboard className="h-3.5 w-3.5 text-[#ff5b00]" />
        <span className="text-[11px] font-black uppercase tracking-[2px] text-[#ff5b00]">
          {data.title}
        </span>
      </div>
      <p className="line-clamp-2 text-[11px] leading-relaxed text-white/40">
        {data.summary}
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

export const SceneGroupNode = memo(Node);
