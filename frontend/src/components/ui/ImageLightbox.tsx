'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  ZoomIn,
  ZoomOut,
  Minimize2,
  Info,
  Columns2,
} from 'lucide-react';

import { API_URL } from '@/lib/apiBase';

export interface LightboxImage {
  frameId: string;
  assetUrl: string;
  thumbUrl?: string;
  prompt: string;
  frameIndex: number;
  sceneTitle?: string;
  createdAt?: string;
  imageWidth?: number;
  imageHeight?: number;
  modelName?: string;
}

interface Props {
  images: LightboxImage[];
  startIndex: number;
  onClose: () => void;
}

export function ImageLightbox({ images, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [compareIndex, setCompareIndex] = useState(() => {
    if (images.length < 2) return 0;
    return startIndex === 0 ? 1 : 0;
  });

  const current = images[index];
  const safeCompareIndex =
    images.length >= 2 && compareIndex === index ? (index + 1) % images.length : compareIndex;
  const compareImg = images[safeCompareIndex] ?? current;
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const goPrev = useCallback(() => {
    if (hasPrev) {
      setIndex((i) => i - 1);
      setLoaded(false);
      resetView();
    }
  }, [hasPrev, resetView]);

  const goNext = useCallback(() => {
    if (hasNext) {
      setIndex((i) => i + 1);
      setLoaded(false);
      resetView();
    }
  }, [hasNext, resetView]);

  const toggleZoom = useCallback(() => {
    if (zoom > 1) resetView();
    else setZoom(2);
  }, [zoom, resetView]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.5, 5));
      if (e.key === '-') setZoom((z) => Math.max(z - 0.5, 1));
      if (e.key === '0') resetView();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goPrev, goNext, resetView]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return;
      e.preventDefault();
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [zoom, pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      setPan({
        x: dragStart.current.panX + (e.clientX - dragStart.current.x),
        y: dragStart.current.panY + (e.clientY - dragStart.current.y),
      });
    },
    [dragging],
  );

  const handleMouseUp = useCallback(() => setDragging(false), []);

  const handleDownload = useCallback(() => {
    const a = document.createElement('a');
    a.href = `${API_URL}${current.assetUrl}`;
    a.download = `${current.frameId}.png`;
    a.click();
  }, [current]);

  const imgTransform = {
    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
    transition: dragging ? 'none' : 'transform 0.25s cubic-bezier(0.23, 1, 0.32, 1)',
  } as const;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex flex-col"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-2xl motion-modal-backdrop"
        onClick={onClose}
      />

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <span className="shrink-0 rounded-full border border-white/5 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/50 sm:px-4 sm:text-[11px]">
            {index + 1} / {images.length}
          </span>
          <span className="truncate text-[11px] text-white/30 sm:text-[12px]">
            Frame {current.frameIndex + 1}
          </span>
          {compare && images.length > 1 && (
            <select
              value={safeCompareIndex}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCompareIndex(v === index ? (v + 1) % images.length : v);
              }}
              className="max-w-[140px] rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-white/70 sm:max-w-[200px] sm:text-[11px]"
            >
              {images.map((im, i) => (
                <option key={im.frameId} value={i}>
                  F{im.frameIndex + 1}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={() => {
              setCompare((c) => !c);
              resetView();
            }}
            disabled={images.length < 2}
            className={`rounded-xl p-2 text-white/40 transition-colors fine-hover:hover:bg-white/5 fine-hover:hover:text-white/80 disabled:opacity-25 ${
              compare ? 'bg-[#ff5b00]/15 text-[#ff5b00]' : ''
            }`}
            title="Compare two frames"
          >
            <Columns2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setInfoOpen((o) => !o)}
            className="rounded-xl p-2 text-white/40 transition-colors fine-hover:hover:bg-white/5 fine-hover:hover:text-white/80"
            title="Frame info"
          >
            <Info className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(z - 0.5, 1))}
            className="rounded-xl p-2 text-white/40 transition-colors fine-hover:hover:bg-white/5 fine-hover:hover:text-white/80"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleZoom}
            className="rounded-xl p-2 text-white/40 transition-colors fine-hover:hover:bg-white/5 fine-hover:hover:text-white/80"
            title={zoom > 1 ? 'Fit to screen' : '100% zoom'}
          >
            {zoom > 1 ? <Minimize2 className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(z + 0.5, 5))}
            className="rounded-xl p-2 text-white/40 transition-colors fine-hover:hover:bg-white/5 fine-hover:hover:text-white/80"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-xl p-2 text-white/40 transition-colors fine-hover:hover:bg-white/5 fine-hover:hover:text-white/80"
            title="Download image"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-white/40 transition-colors fine-hover:hover:bg-white/5 fine-hover:hover:text-white/80"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 sm:px-12">
        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/5 text-white/40 backdrop-blur-sm transition-colors fine-hover:hover:bg-white/10 fine-hover:hover:text-white sm:left-4 sm:h-12 sm:w-12"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {compare && images.length > 1 ? (
          <div
            className="flex max-h-[70vh] max-w-[min(96vw,1200px)] select-none items-center justify-center gap-2 sm:gap-4"
            style={{
              ...imgTransform,
              cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
            }}
            onMouseDown={handleMouseDown}
          >
            <img
              src={`${API_URL}${current.assetUrl}`}
              alt=""
              className="max-h-[65vh] max-w-[42vw] rounded-[14px] object-contain shadow-2xl"
              draggable={false}
            />
            <img
              src={`${API_URL}${compareImg.assetUrl}`}
              alt=""
              className="max-h-[65vh] max-w-[42vw] rounded-[14px] object-contain shadow-2xl"
              draggable={false}
            />
          </div>
        ) : (
          <div
            className="relative max-h-[75vh] max-w-[85vw] select-none"
            style={{
              ...imgTransform,
              cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
            }}
            onMouseDown={handleMouseDown}
            onDoubleClick={toggleZoom}
          >
            {!loaded && current.thumbUrl && (
              <img
                src={`${API_URL}${current.thumbUrl}`}
                alt=""
                className="max-h-[75vh] max-w-[85vw] rounded-[16px] object-contain blur-sm"
                draggable={false}
              />
            )}
            <img
              key={current.assetUrl}
              src={`${API_URL}${current.assetUrl}`}
              alt={`Frame ${current.frameIndex + 1}`}
              className={`max-h-[75vh] max-w-[85vw] rounded-[16px] object-contain shadow-2xl transition-opacity duration-500 ${
                loaded ? 'opacity-100' : 'absolute inset-0 opacity-0'
              }`}
              onLoad={() => setLoaded(true)}
              draggable={false}
            />
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#ff5b00]" />
              </div>
            )}
          </div>
        )}

        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            className="absolute right-2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/5 bg-white/5 text-white/40 backdrop-blur-sm transition-colors fine-hover:hover:bg-white/10 fine-hover:hover:text-white sm:right-4 sm:h-12 sm:w-12"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      <div className="relative z-10 border-t border-white/[0.06] bg-black/20 px-3 py-2">
        <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto pb-1">
          {images.map((im, i) => {
            const src = im.thumbUrl ? `${API_URL}${im.thumbUrl}` : `${API_URL}${im.assetUrl}`;
            return (
              <button
                key={im.frameId}
                type="button"
                onClick={() => {
                  setIndex(i);
                  setLoaded(false);
                  resetView();
                }}
                className={`relative h-[80px] w-[80px] shrink-0 overflow-hidden rounded-lg border-2 transition-[border-color,transform] duration-200 ease-out ${
                  i === index ? 'scale-[1.02] border-[#ff5b00]' : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative z-10 px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-3xl rounded-[20px] border border-white/5 bg-white/[0.03] px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-4">
          <p className="line-clamp-3 text-[12px] leading-relaxed text-white/50">{current.prompt}</p>
        </div>
      </div>

      <aside
        className={`fixed bottom-0 right-0 top-0 z-[110] w-[280px] max-w-[100vw] border-l border-white/[0.08] bg-[#0a0a0a]/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out ${
          infoOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/45">
            Frame details
          </span>
          <button
            type="button"
            onClick={() => setInfoOpen(false)}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/5 hover:text-white/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto p-4 text-[12px] text-white/55">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/30">Prompt</p>
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed">
              {current.prompt}
            </p>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(current.prompt)}
              className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#ff5b00]/80 hover:text-[#ff5b00]"
            >
              Copy prompt
            </button>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/30">Scene</p>
            <p>{current.sceneTitle ?? '—'}</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/30">Frame index</p>
            <p>{current.frameIndex + 1}</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/30">Timestamp</p>
            <p>{current.createdAt ? new Date(current.createdAt).toLocaleString() : '—'}</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/30">Dimensions</p>
            <p>
              {current.imageWidth && current.imageHeight
                ? `${current.imageWidth}×${current.imageHeight}`
                : '—'}
            </p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/30">Model</p>
            <p>{current.modelName ?? '—'}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
