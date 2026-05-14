'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Film } from 'lucide-react';

interface Data {
  title: string;
  summary: string;
}

function Node({ data }: { data: Data }) {
  return (
    <div className="w-[260px] rounded-[16px] border border-[#1a1a1a] bg-[#0a0a0a] px-4 py-3.5 shadow-xl">
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-[#1a1a1a] !bg-[#ff5b00]"
      />

      <div className="mb-1.5 flex items-center gap-2">
        <Film className="h-3.5 w-3.5 text-[#ff5b00]" />
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
        className="!h-2 !w-2 !border-[#1a1a1a] !bg-[#ff5b00]"
      />
    </div>
  );
}

export const SceneGroupNode = memo(Node);
