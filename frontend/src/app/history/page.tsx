'use client';

import {
  type MouseEvent,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Image as ImageIcon,
  Network,
  Clock,
  CheckCircle2,
  XCircle,
  CirclePlus,
  LayoutGrid,
  List,
  Trash2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { API_URL } from '@/lib/apiBase';
const VIEW_KEY = 'nodewow:history-view';

function setHistoryCardGlow(e: MouseEvent<HTMLDivElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const w = r.width || 1;
  const h = r.height || 1;
  el.style.setProperty('--rx', `${((e.clientX - r.left) / w) * 100}%`);
  el.style.setProperty('--ry', `${((e.clientY - r.top) / h) * 100}%`);
}

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

type ViewMode = 'grid' | 'list';
type FilterKey = 'all' | 'complete' | 'progress' | 'failed' | 'stopped';

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
    case 'orchestrating':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ff5b00]/20 bg-[#ff5b00]/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#ff5b00]">
          <Loader2 className="h-3 w-3 animate-spin" /> In progress
        </span>
      );
    case 'killed':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-400">
          Stopped
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
  return (
    d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }) +
    ', ' +
    d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  );
}

function duration(start: string, end: string | null) {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return '<1s';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function matchesFilter(run: Run, key: FilterKey) {
  const s = run.status;
  if (key === 'all') return true;
  if (key === 'complete') return s === 'complete';
  if (key === 'progress') return s === 'generating' || s === 'orchestrating';
  if (key === 'failed') return s === 'failed';
  if (key === 'stopped') return s === 'killed';
  return true;
}

function HistorySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-[24px] border border-[#1a1a1a] bg-[#0d0d0d] p-6"
        >
          <div className="mb-4 h-36 overflow-hidden rounded-xl bg-white/[0.04]">
            <div className="h-full w-full -translate-x-full animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          </div>
          <div className="mb-2 h-3 w-[80%] overflow-hidden rounded bg-white/[0.06]">
            <div className="h-full w-full -translate-x-full animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          </div>
          <div className="h-3 w-[60%] overflow-hidden rounded bg-white/[0.05]">
            <div className="h-full w-full -translate-x-full animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'list';
    const v = window.localStorage.getItem(VIEW_KEY);
    return v === 'grid' ? 'grid' : 'list';
  });
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 200);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    window.localStorage.setItem(VIEW_KEY, viewMode);
  }, [viewMode]);

  const refresh = useCallback(() => {
    const ctrl = new AbortController();
    const kill = window.setTimeout(() => ctrl.abort(), 25_000);
    fetch(`${API_URL}/api/runs`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ runs?: Run[] }>;
      })
      .then((d) => {
        const list = d.runs ?? [];
        setRuns(list);
        const n = list.filter(
          (x: Run) => x.status === 'generating' || x.status === 'orchestrating',
        ).length;
        setActiveCount(n);
      })
      .catch(() => setRuns([]))
      .finally(() => {
        window.clearTimeout(kill);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (!matchesFilter(r, filter)) return false;
      if (!debouncedSearch) return true;
      return (r.prompt ?? '').toLowerCase().includes(debouncedSearch);
    });
  }, [runs, filter, debouncedSearch]);

  const confirmDelete = useCallback(async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`${API_URL}/api/runs/${deleteId}`, { method: 'DELETE' });
      if (res.ok) setRuns((prev) => prev.filter((x) => x.runId !== deleteId));
    } catch {
      /* ignore */
    }
    setDeleteId(null);
  }, [deleteId]);

  const filterChips: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'complete', label: 'Complete' },
    { key: 'progress', label: 'In Progress' },
    { key: 'failed', label: 'Failed' },
    { key: 'stopped', label: 'Stopped' },
  ];

  return (
    <main className="min-h-screen bg-[#121212] font-body">
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
              <Network className="h-5 w-5 text-[#ff5b00]" />
              <span className="font-display text-lg font-black uppercase tracking-[4px] text-white">
                Node<span className="text-[#ff5b00]">Wow</span>
              </span>
              {activeCount > 0 && (
                <span className="rounded-full border border-[#ff5b00]/25 bg-[#ff5b00]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#ff5b00]">
                  {activeCount} running
                </span>
              )}
            </div>
          </div>
          <Link href="/">
            <Button size="sm">
              <CirclePlus className="h-3.5 w-3.5" />
              New Generation
            </Button>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-6 pt-10 pb-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[#ff5b00]" />
          <span className="text-[12px] font-black uppercase tracking-[3px] text-white/60">
            Generation History
          </span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-xl text-sm text-white/30">
            All your past generations — click any to revisit the full pipeline graph.
          </p>
          <div className="flex items-center gap-2 rounded-[14px] border border-white/[0.08] bg-[#0d0d0d] p-1">
            <button
              type="button"
              title="Grid view"
              aria-label="Grid view"
              onClick={() => setViewMode('grid')}
              className={`rounded-[10px] p-2 transition-colors ${
                viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="List view"
              aria-label="List view"
              onClick={() => setViewMode('list')}
              className={`rounded-[10px] p-2 transition-colors ${
                viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-1 border-b border-white/[0.06] pb-px lg:border-0 lg:pb-0">
            {filterChips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key)}
                className={`relative px-3 py-2 text-[12px] font-bold uppercase tracking-wider transition-colors ${
                  filter === c.key ? 'text-white' : 'text-white/35 hover:text-white/55'
                }`}
              >
                {c.label}
                {filter === c.key && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[#ff5b00]" />
                )}
              </button>
            ))}
          </div>
          <div className="relative flex-1 lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prompts…"
              className="w-full rounded-[14px] border border-white/[0.08] bg-black/30 py-2.5 pl-10 pr-3 text-[13px] text-white/80 placeholder:text-white/25 focus:border-[#ff5b00]/35 focus:outline-none focus:ring-1 focus:ring-[#ff5b00]/20"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-6 pb-16">
        {loading ? (
          <HistorySkeleton />
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
              <ImageIcon className="h-7 w-7 text-white/15" />
            </div>
            <p className="text-sm text-white/30">No generations yet — go create your first one!</p>
            <Link href="/">
              <Button size="md">Start Generating</Button>
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-white/35">No runs match your filters.</p>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((run) => (
              <div key={run.runId} className="relative">
                <Link href={`/run/${run.runId}`} className="block">
                  <div
                    className="group relative overflow-hidden rounded-[24px] border border-[#1a1a1a] bg-[#0d0d0d]"
                    onMouseMove={setHistoryCardGlow}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 z-0 rounded-[24px] opacity-0 transition-opacity duration-200 ease-out fine-hover:group-hover:opacity-100"
                      style={{
                        background:
                          'radial-gradient(520px circle at var(--rx, 50%) var(--ry, 42%), rgba(255, 91, 0, 0.14), transparent 50%)',
                      }}
                    />
                    <div className="relative z-[1]">
                      <div className="relative aspect-[16/10] bg-black/50">
                      {run.thumbnails[0] ? (
                        <img
                          src={`${API_URL}${run.thumbnails[0]}`}
                          alt=""
                          className="h-full w-full object-cover opacity-90"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImageIcon className="h-10 w-10 text-white/10" />
                        </div>
                      )}
                      {run.thumbnails.length > 1 && (
                        <div className="pointer-events-none absolute bottom-2 right-2 flex gap-1 rounded-lg border border-white/10 bg-black/85 p-1">
                          {run.thumbnails.slice(0, 4).map((u, i) => (
                            <div
                              key={i}
                              className="h-8 w-12 overflow-hidden rounded border border-white/10 sm:h-9 sm:w-14"
                            >
                              <img
                                src={`${API_URL}${u}`}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <p className="mb-3 line-clamp-2 text-[13px] leading-relaxed text-white/75">
                        {run.prompt}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {statusBadge(run.status)}
                        <span className="text-[11px] text-white/35">{run.total} frames</span>
                      </div>
                    </div>
                    </div>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteId(run.runId);
                  }}
                  className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-black/80 text-white/40 transition-colors hover:border-red-500/40 hover:text-red-300"
                  aria-label="Delete run"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((run) => (
              <div key={run.runId} className="relative">
                <Link href={`/run/${run.runId}`} className="block min-w-0">
                  <div
                    className="group relative overflow-hidden rounded-[24px] border border-[#1a1a1a] bg-[#0d0d0d] p-6"
                    onMouseMove={setHistoryCardGlow}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 z-0 rounded-[24px] opacity-0 transition-opacity duration-200 ease-out fine-hover:group-hover:opacity-100"
                      style={{
                        background:
                          'radial-gradient(520px circle at var(--rx, 50%) var(--ry, 42%), rgba(255, 91, 0, 0.14), transparent 50%)',
                      }}
                    />
                    <div className="relative z-[1] flex items-start gap-6 pr-12">
                      <div className="relative flex shrink-0 flex-col gap-1.5">
                        <div className="flex gap-2">
                          {run.thumbnails.length > 0 ? (
                            <>
                              {run.thumbnails.slice(0, 2).map((url, i) => (
                                <div
                                  key={i}
                                  className="relative h-[60px] w-[107px] overflow-hidden rounded-[10px] bg-black/60"
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
                                <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[10px] border border-white/5 bg-black/60">
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
                        {run.thumbnails.length > 2 && (
                          <div className="flex gap-1 rounded-lg border border-white/[0.08] bg-black/80 p-1">
                            {run.thumbnails.slice(0, 4).map((u, i) => (
                              <div
                                key={i}
                                className="h-7 w-11 overflow-hidden rounded border border-white/10 sm:h-8 sm:w-12"
                              >
                                <img
                                  src={`${API_URL}${u}`}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="mb-2 line-clamp-2 text-[13px] leading-relaxed text-white/75">
                          {run.prompt}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/30">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(run.createdAt)}
                          </span>
                          <span>·</span>
                          <span>
                            {run.total} frame{run.total !== 1 ? 's' : ''}
                          </span>
                          {run.completed > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-emerald-400/60">{run.completed} completed</span>
                            </>
                          )}
                          {run.failed > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-red-400/60">{run.failed} failed</span>
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

                      <div className="shrink-0 pt-1">{statusBadge(run.status)}</div>
                    </div>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteId(run.runId);
                  }}
                  className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-black/85 text-white/40 transition-colors hover:border-red-500/40 hover:text-red-300"
                  aria-label="Delete run"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md motion-modal-backdrop"
            onClick={() => setDeleteId(null)}
          />
          <div className="motion-modal-panel relative z-10 w-full max-w-md rounded-[20px] border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl">
            <p className="mb-2 text-lg font-bold text-white">Delete this run?</p>
            <p className="mb-6 text-sm text-white/45">This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="!bg-red-600 hover:!bg-red-500"
                onClick={() => void confirmDelete()}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
