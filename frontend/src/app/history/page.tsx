'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Image as ImageIcon,
  Layers,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Run {
  runId: string;
  prompt: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
  createdAt: string;
  completedAt: string | null;
  thumbnails: string[];
}

function statusBadge(status: string) {
  switch (status) {
    case 'complete':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
          <CheckCircle2 className="h-3 w-3" /> Complete
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400">
          <XCircle className="h-3 w-3" /> Failed
        </span>
      );
    case 'generating':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ff5b00]/20 bg-[#ff5b00]/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#ff5b00]">
          <Loader2 className="h-3 w-3 animate-spin" /> Generating
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
          <Clock className="h-3 w-3" /> {status}
        </span>
      );
  }
}

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }) +
    ', ' +
    d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
}

function duration(start: string, end: string | null) {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return '<1s';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/runs`)
      .then((r) => r.json())
      .then((d) => {
        setRuns(d.runs ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[#121212] font-body">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[#1a1a1a] bg-[#0a0a0a]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-2.5">
              <Layers className="h-5 w-5 text-[#ff5b00]" />
              <span className="font-display text-lg font-black uppercase tracking-[4px] text-white">
                Node<span className="text-[#ff5b00]">Wow</span>
              </span>
            </div>
          </div>
          <Link href="/">
            <Button size="sm">
              <Zap className="h-3.5 w-3.5" />
              New Generation
            </Button>
          </Link>
        </div>
      </header>

      {/* Title */}
      <div className="mx-auto max-w-[1200px] px-6 pt-10 pb-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[#ff5b00]" />
          <span className="text-[12px] font-black uppercase tracking-[3px] text-white/60">
            Generation History
          </span>
        </div>
        <p className="text-sm text-white/30">
          All your past generations — click any to revisit the full pipeline graph.
        </p>
      </div>

      {/* Run list */}
      <div className="mx-auto max-w-[1200px] px-6 pb-16">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-[#ff5b00]" />
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
              <ImageIcon className="h-7 w-7 text-white/15" />
            </div>
            <p className="text-sm text-white/30">No generations yet — go create your first one!</p>
            <Link href="/">
              <Button size="md">Start Generating</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run) => (
              <Link key={run.runId} href={`/run/${run.runId}`}>
                <div className="group rounded-[24px] border border-[#1a1a1a] bg-[#0d0d0d] p-6 transition-all duration-300 hover:border-[#ff5b00]/30 hover:shadow-[0_0_40px_rgba(255,91,0,0.04)] cursor-pointer mb-4">
                  <div className="flex items-start gap-6">
                    {/* Thumbnail strip — max 2 shown, +X for rest */}
                    <div className="flex gap-2 shrink-0">
                      {run.thumbnails.length > 0 ? (
                        <>
                          {run.thumbnails.slice(0, 2).map((url, i) => (
                            <div
                              key={i}
                              className="h-[60px] w-[107px] overflow-hidden rounded-[10px] bg-black/60 transition-transform duration-300 group-hover:scale-[1.02]"
                            >
                              <img
                                src={`${API_URL}${url}`}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          ))}
                          {run.thumbnails.length > 2 && (
                            <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[10px] bg-black/60 border border-white/5">
                              <span className="text-[12px] font-bold text-white/40">
                                +{run.thumbnails.length - 2}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex h-[60px] w-[107px] items-center justify-center rounded-[10px] bg-black/40">
                          <ImageIcon className="h-5 w-5 text-white/10" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="mb-2 line-clamp-2 text-[13px] leading-relaxed text-white/75 group-hover:text-white/90 transition-colors">
                        {run.prompt}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/30">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(run.createdAt)}
                        </span>
                        <span>·</span>
                        <span>{run.total} frame{run.total !== 1 ? 's' : ''}</span>
                        {run.completed > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-emerald-400/60">
                              {run.completed} completed
                            </span>
                          </>
                        )}
                        {run.failed > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-red-400/60">
                              {run.failed} failed
                            </span>
                          </>
                        )}
                        {duration(run.createdAt, run.completedAt) && (
                          <>
                            <span>·</span>
                            <span>{duration(run.createdAt, run.completedAt)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="shrink-0 pt-1">{statusBadge(run.status)}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
