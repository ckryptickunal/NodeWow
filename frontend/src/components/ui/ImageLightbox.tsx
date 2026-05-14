'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface LightboxImage {
  frameId: string;
  assetUrl: string;
  thumbUrl?: string;
  prompt: string;
  frameIndex: number;
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

  const current = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const goPrev = useCallback(() => {
    if (hasPrev) { setIndex((i) => i - 1); setLoaded(false); resetView(); }
  }, [hasPrev, resetView]);

  const goNext = useCallback(() => {
    if (hasNext) { setIndex((i) => i + 1); setLoaded(false); resetView(); }
  }, [hasNext, resetView]);

  const toggleZoom = useCallback(() => {
    if (zoom > 1) { resetView(); } else { setZoom(2); }
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
    return () => { document.body.style.overflow = ''; };
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

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex flex-col"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-2xl animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white/5 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/50 border border-white/5">
            {index + 1} / {images.length}
          </span>
          <span className="text-[12px] text-white/30">
            Frame {current.frameIndex + 1}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.5, 1))}
            className="rounded-xl p-2.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
            title="Zoom out (−)"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={toggleZoom}
            className="rounded-xl p-2.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
            title={zoom > 1 ? 'Reset zoom (0)' : 'Zoom in'}
          >
            {zoom > 1 ? <Maximize2 className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.5, 5))}
            className="rounded-xl p-2.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
            title="Zoom in (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="mx-2 h-5 w-px bg-white/10" />
          <button
            onClick={handleDownload}
            className="rounded-xl p-2.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
            title="Download 4K image"
          >
            <Download className="h-4 w-4" />
          </button>
          <div className="mx-2 h-5 w-px bg-white/10" />
          <button
            onClick={onClose}
            className="rounded-xl p-2.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="relative z-10 flex flex-1 items-center justify-center overflow-hidden px-16">
        {/* Prev button */}
        {hasPrev && (
          <button
            onClick={goPrev}
            className="absolute left-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-white/40 backdrop-blur-sm transition-all hover:bg-white/10 hover:text-white border border-white/5 hover:border-white/10"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* Image */}
        <div
          className="relative max-h-[75vh] max-w-[85vw] select-none"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transition: dragging ? 'none' : 'transform 0.2s ease-out',
            cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
          }}
          onMouseDown={handleMouseDown}
          onDoubleClick={toggleZoom}
        >
          {/* Thumbnail placeholder (shows while full image loads) */}
          {!loaded && current.thumbUrl && (
            <img
              src={`${API_URL}${current.thumbUrl}`}
              alt=""
              className="max-h-[75vh] max-w-[85vw] rounded-[16px] object-contain blur-sm"
              draggable={false}
            />
          )}

          {/* Full-res image */}
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

          {/* Loading spinner */}
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#ff5b00]" />
            </div>
          )}
        </div>

        {/* Next button */}
        {hasNext && (
          <button
            onClick={goNext}
            className="absolute right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-white/40 backdrop-blur-sm transition-all hover:bg-white/10 hover:text-white border border-white/5 hover:border-white/10"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Bottom info bar */}
      <div className="relative z-10 px-6 py-4">
        <div className="mx-auto max-w-3xl rounded-[20px] border border-white/5 bg-white/[0.03] px-6 py-4 backdrop-blur-xl">
          <p className="line-clamp-3 text-[12px] leading-relaxed text-white/50">
            {current.prompt}
          </p>
        </div>
      </div>
    </div>
  );
}
