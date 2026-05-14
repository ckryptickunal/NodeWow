'use client';

import { CheckCircle2, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const cfg = {
  queued: {
    bg: 'bg-white/5',
    border: 'border-white/10',
    text: 'text-white/60',
    Icon: Clock,
    label: 'Queued',
  },
  generating: {
    bg: 'bg-[#ff5b00]/5',
    border: 'border-[#ff5b00]/20',
    text: 'text-[#ff5b00]',
    Icon: Loader2,
    label: 'Generating',
  },
  complete: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
    Icon: CheckCircle2,
    label: 'Complete',
  },
  failed: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    Icon: AlertCircle,
    label: 'Failed',
  },
} as const;

type Status = keyof typeof cfg;

export function StatusBadge({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  const { bg, border, text, Icon, label } = cfg[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest',
        bg,
        border,
        text,
        className,
      )}
    >
      <Icon
        className={cn('h-3 w-3', status === 'generating' && 'animate-spin')}
      />
      {label}
    </span>
  );
}
