'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Scissors, Loader2, Radio } from 'lucide-react';

interface ClipEditorProps {
  streamUrl: string;
  bufferDuration: number;
  isBuffering?: boolean;
  onClose: () => void;
  onClipCreated: (clip: any) => void;
}

const MIN_CLIP = 5;
const MAX_CLIP = 120;
const TARGET_BUFFER = 60; // show progress toward this goal

export function ClipEditor({ streamUrl, bufferDuration: initialBuffer, isBuffering = true, onClose, onClipCreated }: ClipEditorProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [bufferDuration, setBufferDuration] = useState(initialBuffer);
  const [start, setStart] = useState(Math.max(0, initialBuffer - 30));
  const [end, setEnd] = useState(initialBuffer);
  const [dragging, setDragging] = useState<'start' | 'end' | 'range' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartValues, setDragStartValues] = useState({ start: 0, end: 0 });
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [previewTime, setPreviewTime] = useState<number | null>(null);
  const [thumbnails, setThumbnails] = useState<{ time: number; url: string }[]>([]);

  const duration = end - start;
  const totalDuration = bufferDuration;

  const toPercent = (seconds: number) => (seconds / Math.max(totalDuration, 1)) * 100;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Poll buffer duration while buffering
  useEffect(() => {
    if (!isBuffering) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/buffer?streamUrl=${encodeURIComponent(streamUrl)}`);
        const data = await res.json();
        if (data.totalDuration > bufferDuration) {
          setBufferDuration(data.totalDuration);
          // Extend end handle if it was at the edge
          setEnd((prev) => prev >= bufferDuration - 2 ? data.totalDuration : prev);
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [isBuffering, streamUrl, bufferDuration]);

  // Fetch thumbnails from backend FFmpeg extractor
  const fetchThumbnails = useCallback(async () => {
    try {
      const res = await fetch(`/api/thumbnails?streamUrl=${encodeURIComponent(streamUrl)}`);
      const data = await res.json();
      if (data.thumbnails?.length > 0) {
        setThumbnails(data.thumbnails.map((t: any) => ({ time: t.time, url: t.dataUrl })));
      }
    } catch {
      // ignore — waveform placeholder shows as fallback
    }
  }, [streamUrl]);

  useEffect(() => {
    fetchThumbnails();
    const interval = setInterval(fetchThumbnails, 10000);
    return () => clearInterval(interval);
  }, [fetchThumbnails]);

  // Mouse drag handlers
  const onMouseDown = (e: React.MouseEvent, handle: 'start' | 'end' | 'range') => {
    e.preventDefault();
    setDragging(handle);
    setDragStartX(e.clientX);
    setDragStartValues({ start, end });
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const deltaSeconds = ((e.clientX - dragStartX) / rect.width) * totalDuration;

      if (dragging === 'start') {
        setStart(Math.max(0, Math.min(dragStartValues.start + deltaSeconds, end - MIN_CLIP)));
      } else if (dragging === 'end') {
        setEnd(Math.min(totalDuration, Math.min(start + MAX_CLIP, Math.max(dragStartValues.end + deltaSeconds, start + MIN_CLIP))));
      } else if (dragging === 'range') {
        const len = dragStartValues.end - dragStartValues.start;
        let ns = dragStartValues.start + deltaSeconds;
        let ne = dragStartValues.end + deltaSeconds;
        if (ns < 0) { ns = 0; ne = len; }
        if (ne > totalDuration) { ne = totalDuration; ns = totalDuration - len; }
        setStart(ns);
        setEnd(ne);
      }
    };
    const onMouseUp = () => setDragging(null);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [dragging, dragStartX, dragStartValues, start, end, totalDuration]);

  // Timeline hover preview
  const onTimelineMouseMove = (e: React.MouseEvent) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = ((e.clientX - rect.left) / rect.width) * totalDuration;
    setPreviewTime(Math.max(0, Math.min(totalDuration, t)));
  };

  // Find closest thumbnail to a time
  const closestThumb = (t: number) => {
    if (thumbnails.length === 0) return null;
    return thumbnails.reduce((a, b) => Math.abs(a.time - t) < Math.abs(b.time - t) ? a : b);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamUrl,
          startSeconds: Math.floor(start),
          endSeconds: Math.ceil(end),
          title: title || `Clip ${new Date().toLocaleTimeString()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed');
      onClipCreated(data.clip);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save clip');
    } finally {
      setSaving(false);
    }
  };

  const ticks = [];
  for (let t = 0; t <= totalDuration; t += 10) ticks.push(t);

  const bufferProgress = Math.min(100, (bufferDuration / TARGET_BUFFER) * 100);
  const bufferReady = bufferDuration >= TARGET_BUFFER;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Clip editor</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Buffer progress bar */}
          {isBuffering && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Radio className="w-3 h-3 text-red-500 animate-pulse" />
                  <span>{bufferReady ? 'Buffer ready' : 'Buffering stream'}</span>
                </div>
                <span className="font-mono font-medium text-foreground">{formatTime(bufferDuration)} buffered</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full transition-all duration-500"
                  style={{ width: `${bufferProgress}%` }}
                />
              </div>
              {bufferDuration < 10 && (
                <p className="text-xs text-muted-foreground">Wait for more buffer before clipping…</p>
              )}
            </div>
          )}

          {/* Thumbnail strip + preview */}
          <div className="relative h-16 bg-muted rounded-lg overflow-hidden">
            {thumbnails.length > 0 ? (
              <div className="absolute inset-0 flex">
                {thumbnails.map((t, i) => (
                  <img
                    key={i}
                    src={t.url}
                    alt=""
                    className="h-full object-cover flex-1"
                    style={{ minWidth: 0 }}
                  />
                ))}
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex gap-1">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="w-1 rounded-full bg-muted-foreground/30" style={{ height: `${20 + Math.sin(i * 0.8) * 14}px` }} />
                  ))}
                </div>
              </div>
            )}

            {/* Dim outside selection */}
            <div className="absolute inset-y-0 left-0 bg-black/60" style={{ width: `${toPercent(start)}%` }} />
            <div className="absolute inset-y-0 right-0 bg-black/60" style={{ width: `${100 - toPercent(end)}%` }} />

            {/* Selection border */}
            <div
              className="absolute inset-y-0 border-2 border-primary pointer-events-none"
              style={{ left: `${toPercent(start)}%`, width: `${toPercent(end) - toPercent(start)}%` }}
            />

            {/* Hover preview tooltip */}
            {previewTime !== null && (() => {
              const thumb = closestThumb(previewTime);
              return (
                <div
                  className="absolute bottom-full mb-1 -translate-x-1/2 z-20 pointer-events-none"
                  style={{ left: `${toPercent(previewTime)}%` }}
                >
                  {thumb && (
                    <img src={thumb.url} alt="" className="w-24 h-14 object-cover rounded border border-border shadow-lg" />
                  )}
                  <div className="text-center text-[10px] font-mono text-foreground bg-background/90 rounded px-1 mt-0.5">
                    {formatTime(previewTime)}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Timeline with handles */}
          <div
            className="relative select-none"
            style={{ userSelect: 'none' }}
            onMouseLeave={() => setPreviewTime(null)}
          >
            {/* Tick marks */}
            <div className="relative h-5 mb-1">
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 flex flex-col items-center"
                  style={{ left: `${toPercent(t)}%`, transform: 'translateX(-50%)' }}
                >
                  <div className="w-px h-2 bg-border" />
                  {t % 30 === 0 && (
                    <span className="text-[10px] text-muted-foreground mt-0.5">{formatTime(t)}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Drag track */}
            <div
              ref={timelineRef}
              className="relative h-10 bg-muted rounded-lg overflow-visible cursor-crosshair"
              onMouseMove={onTimelineMouseMove}
            >
              {/* Buffer fill */}
              <div
                className="absolute inset-y-0 left-0 bg-primary/5 rounded-lg transition-all duration-500"
                style={{ width: `${toPercent(bufferDuration)}%` }}
              />

              {/* Dim outside selection */}
              <div className="absolute inset-y-0 left-0 bg-black/30 rounded-l-lg" style={{ width: `${toPercent(start)}%` }} />
              <div className="absolute inset-y-0 right-0 bg-black/30 rounded-r-lg" style={{ width: `${100 - toPercent(end)}%` }} />

              {/* Selected range */}
              <div
                className="absolute inset-y-0 border-y-2 border-primary bg-primary/10 cursor-grab active:cursor-grabbing"
                style={{ left: `${toPercent(start)}%`, width: `${toPercent(end) - toPercent(start)}%` }}
                onMouseDown={(e) => onMouseDown(e, 'range')}
              />

              {/* Start time label */}
              <div
                className="absolute -top-5 text-[10px] font-mono text-primary font-medium pointer-events-none"
                style={{ left: `${toPercent(start)}%`, transform: 'translateX(-50%)' }}
              >
                {formatTime(start)}
              </div>

              {/* End time label */}
              <div
                className="absolute -top-5 text-[10px] font-mono text-primary font-medium pointer-events-none"
                style={{ left: `${toPercent(end)}%`, transform: 'translateX(-50%)' }}
              >
                {formatTime(end)}
              </div>

              {/* Start handle */}
              <div
                className="absolute inset-y-0 w-3 bg-primary cursor-ew-resize flex items-center justify-center z-10 rounded-l"
                style={{ left: `${toPercent(start)}%`, transform: 'translateX(-100%)' }}
                onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'start'); }}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="w-0.5 h-3 bg-white/70 rounded" />
                  <div className="w-0.5 h-3 bg-white/70 rounded" />
                </div>
              </div>

              {/* End handle */}
              <div
                className="absolute inset-y-0 w-3 bg-primary cursor-ew-resize flex items-center justify-center z-10 rounded-r"
                style={{ left: `${toPercent(end)}%` }}
                onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'end'); }}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="w-0.5 h-3 bg-white/70 rounded" />
                  <div className="w-0.5 h-3 bg-white/70 rounded" />
                </div>
              </div>
            </div>
          </div>

          {/* Duration badge */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Total buffered: {formatTime(totalDuration)}</span>
            <span className={`font-mono font-medium px-2 py-0.5 rounded ${duration > MAX_CLIP ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
              {formatTime(duration)} selected
            </span>
            <span>Max: {formatTime(MAX_CLIP)}</span>
          </div>

          {/* Title input */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Clip title</label>
            <Input
              placeholder={`Clip ${new Date().toLocaleTimeString()}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-sm"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleSave}
              disabled={saving || duration < MIN_CLIP || duration > MAX_CLIP || bufferDuration < 5}
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : (
                <><Scissors className="w-4 h-4" /> Save clip ({formatTime(duration)})</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}