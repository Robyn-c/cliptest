'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Scissors, Loader2, Radio, CheckCircle2, RotateCcw } from 'lucide-react';

interface ClipEditorProps {
  bufferDuration: number;
  isBuffering?: boolean;
  onClose: () => void;
  onClipCreated: (clip: any) => void;
}

const MIN_CLIP = 5;
const MAX_CLIP = 120;
const TARGET_BUFFER = 60;
const POST_SECONDS = 30; // seconds of footage to record after clicking clip

// Flow: 'trim' → click Save → 'waiting' (recording post footage) → 'previewing' → 'confirm' → 'saving' → done
type Stage = 'trim' | 'waiting' | 'previewing' | 'confirm' | 'saving';

export function ClipEditor({
  bufferDuration: initialBuffer,
  isBuffering = true,
  onClose,
  onClipCreated,
}: ClipEditorProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const thumbStripRef = useRef<HTMLDivElement>(null);

  const [bufferDuration, setBufferDuration] = useState(initialBuffer);
  const [start, setStart] = useState(Math.max(0, initialBuffer - 30));
  const [end, setEnd] = useState(initialBuffer);
  const [dragging, setDragging] = useState<'start' | 'end' | 'range' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartValues, setDragStartValues] = useState({ start: 0, end: 0 });
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState<Stage>('trim');

  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [thumbnails, setThumbnails] = useState<{ time: number; url: string }[]>([]);
  const [thumbsLoading, setThumbsLoading] = useState(true);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [countdown, setCountdown] = useState(0);

  const duration = end - start;
  const totalDuration = bufferDuration;
  const toPercent = (s: number) => (s / Math.max(totalDuration, 1)) * 100;
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ── Poll buffer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isBuffering) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/buffer`);
        const data = await res.json();
        if (data.totalDuration > bufferDuration) {
          setBufferDuration(data.totalDuration);
          setEnd((prev) => (prev >= bufferDuration - 2 ? data.totalDuration : prev));
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(iv);
  }, [isBuffering, bufferDuration]);

  // ── Thumbnails ──────────────────────────────────────────────────────────────
  const fetchThumbnails = useCallback(async () => {
    try {
      const res = await fetch(`/api/thumbnails`);
      const data = await res.json();
      if (data.thumbnails?.length > 0) {
        setThumbnails(data.thumbnails.map((t: any) => ({ time: t.time, url: t.dataUrl })));
      }
    } catch { /* ignore */ } finally {
      setThumbsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThumbnails();
    const iv = setInterval(fetchThumbnails, 10_000);
    return () => clearInterval(iv);
  }, [fetchThumbnails]);

  // ── Drag handles ────────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent, handle: 'start' | 'end' | 'range') => {
    e.preventDefault();
    setDragging(handle);
    setDragStartX(e.clientX);
    setDragStartValues({ start, end });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const delta = ((e.clientX - dragStartX) / rect.width) * totalDuration;
      if (dragging === 'start') {
        setStart(Math.max(0, Math.min(dragStartValues.start + delta, end - MIN_CLIP)));
      } else if (dragging === 'end') {
        setEnd(Math.min(totalDuration, Math.min(start + MAX_CLIP, Math.max(dragStartValues.end + delta, start + MIN_CLIP))));
      } else {
        const len = dragStartValues.end - dragStartValues.start;
        let ns = dragStartValues.start + delta;
        let ne = dragStartValues.end + delta;
        if (ns < 0) { ns = 0; ne = len; }
        if (ne > totalDuration) { ne = totalDuration; ns = totalDuration - len; }
        setStart(ns);
        setEnd(ne);
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, dragStartX, dragStartValues, start, end, totalDuration]);

  // ── Thumbnail strip hover ───────────────────────────────────────────────────
  const closestThumb = (t: number) => {
    if (!thumbnails.length) return null;
    return thumbnails.reduce((a, b) => Math.abs(a.time - t) < Math.abs(b.time - t) ? a : b);
  };

  const onStripMouseMove = (e: React.MouseEvent) => {
    const rect = thumbStripRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHoverTime(Math.max(0, Math.min(totalDuration, ((e.clientX - rect.left) / rect.width) * totalDuration)));
    setHoverX(e.clientX - rect.left);
  };

  // ── Step 1: "Save clip" → render preview ────────────────────────────────────
  const handleSaveClick = async () => {
    setError('');
    setPreviewError('');
    setPreviewUrl(null);
    setStage('waiting');
    setCountdown(POST_SECONDS);

    // Countdown while server records post footage
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);

    // Wait POST_SECONDS for post footage to accumulate in buffer
    await new Promise(r => setTimeout(r, POST_SECONDS * 1000));
    clearInterval(interval);
    setCountdown(0);

    // Now generate preview with extended end time to include post footage
    setStage('previewing');
    try {
      const res = await fetch('/api/clip/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startSeconds: Math.floor(start),
          endSeconds: Math.ceil(end) + POST_SECONDS,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setPreviewUrl(data.url);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setStage('confirm');
    }
  };

  // ── Step 2: "Confirm & save" → upload ───────────────────────────────────────
  const handleConfirm = async () => {
    setStage('saving');
    setError('');
    try {
      const res = await fetch('/api/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startSeconds: Math.floor(start),
          endSeconds: Math.ceil(end) + POST_SECONDS,
          title: title || `Clip ${new Date().toLocaleTimeString()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed');
      onClipCreated(data.clip);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save clip');
      setStage('confirm');
    }
  };

  const handleReEdit = () => {
    setStage('trim');
    setPreviewUrl(null);
    setPreviewError('');
    setError('');
  };

  const ticks: number[] = [];
  for (let t = 0; t <= totalDuration; t += 10) ticks.push(t);
  const bufferProgress = Math.min(100, (bufferDuration / TARGET_BUFFER) * 100);
  const bufferReady = bufferDuration >= TARGET_BUFFER;
  const canSave = duration >= MIN_CLIP && duration <= MAX_CLIP && bufferDuration >= 5;

  // ── Preview / confirm screen ─────────────────────────────────────────────────
  if (stage !== 'trim') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden">

          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Scissors className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">
                {stage === 'waiting' ? `Grabando ${countdown}s de post-clip...` : stage === 'previewing' ? 'Renderizando vista previa...' : stage === 'saving' ? 'Guardando clip…' : 'Ver clip'}
              </span>
            </div>
            {stage === 'confirm' && (
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="p-5 space-y-4">

            {/* Video player */}
            <div className="rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
              {(stage === 'waiting' || stage === 'previewing' || stage === 'saving') && (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-sm">
                    {stage === 'waiting'
                      ? `Grabando post-clip... ${countdown}s restantes`
                      : stage === 'previewing'
                      ? `Renderizando ${fmt(duration + POST_SECONDS)} vista previa`
                      : 'Subiendo clip…'}
                  </span>
                  {stage === 'waiting' && (
                    <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-1000"
                        style={{ width: `${((POST_SECONDS - countdown) / POST_SECONDS) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
              {stage === 'confirm' && previewUrl && (
                <video ref={videoRef} src={previewUrl} controls autoPlay className="w-full h-full object-contain" />
              )}
              {stage === 'confirm' && !previewUrl && (
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                  <p className="text-sm text-destructive">{previewError || 'Preview unavailable'}</p>
                  <p className="text-xs">Todavía puedes confirmar y guardar abajo</p>
                </div>
              )}
            </div>

            {/* In/out info */}
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span className="font-mono">{fmt(start)} → {fmt(end)}</span>
              <span className="font-mono font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">{fmt(duration)}</span>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Clip title</label>
              <Input
                placeholder={`Clip ${new Date().toLocaleTimeString()}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-sm"
                disabled={stage !== 'confirm'}
              />
            </div>

            {error && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={handleReEdit}
                disabled={stage !== 'confirm'}
              >
                <RotateCcw className="w-4 h-4" /> Re-editar
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handleConfirm}
                disabled={stage !== 'confirm'}
              >
                {stage === 'saving' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Confirmar y guardar</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Trim screen ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden">

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

          {/* Buffer progress */}
          {isBuffering && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Radio className="w-3 h-3 text-red-500 animate-pulse" />
                  <span>{bufferReady ? 'Buffer ready' : 'Buffering stream'}</span>
                </div>
                <span className="font-mono font-medium text-foreground">{fmt(bufferDuration)} buffered</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full transition-all duration-500" style={{ width: `${bufferProgress}%` }} />
              </div>
              {bufferDuration < 10 && <p className="text-xs text-muted-foreground">Wait for more buffer before clipping…</p>}
            </div>
          )}

          {/* Thumbnail strip */}
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground font-medium">Vista previa - Línea de tiempo</span>
            <div
              ref={thumbStripRef}
              className="relative h-20 bg-muted rounded-lg overflow-visible cursor-crosshair select-none"
              onMouseMove={onStripMouseMove}
              onMouseLeave={() => setHoverTime(null)}
            >
              {thumbnails.length > 0 ? (
                <div className="absolute inset-0 flex rounded-lg overflow-hidden">
                  {thumbnails.map((t, i) => (
                    <img key={i} src={t.url} alt="" className="h-full object-cover flex-1" style={{ minWidth: 0 }} draggable={false} />
                  ))}
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  {thumbsLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" /> Cargando thumbnails…
                    </div>
                  ) : (
                    <div className="flex gap-0.5 items-end px-2 w-full h-full py-3">
                      {[...Array(40)].map((_, i) => (
                        <div key={i} className="flex-1 rounded-sm bg-muted-foreground/25" style={{ height: `${30 + Math.sin(i * 0.6) * 20 + Math.cos(i * 1.1) * 12}%` }} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="absolute inset-y-0 left-0 bg-black/55 rounded-l-lg pointer-events-none" style={{ width: `${toPercent(start)}%` }} />
              <div className="absolute inset-y-0 right-0 bg-black/55 rounded-r-lg pointer-events-none" style={{ width: `${100 - toPercent(end)}%` }} />
              <div className="absolute inset-y-0 border-2 border-primary pointer-events-none" style={{ left: `${toPercent(start)}%`, width: `${toPercent(end) - toPercent(start)}%` }} />

              {/* Hover tooltip */}
              {hoverTime !== null && (() => {
                const thumb = closestThumb(hoverTime);
                const clampedLeft = Math.max(48, Math.min(hoverX, (thumbStripRef.current?.offsetWidth ?? 0) - 48));
                return (
                  <div className="absolute bottom-full mb-2 -translate-x-1/2 z-30 pointer-events-none" style={{ left: clampedLeft }}>
                    {thumb ? (
                      <img src={thumb.url} alt="" className="w-28 h-16 object-cover rounded-md border border-primary shadow-xl" />
                    ) : (
                      <div className="w-28 h-16 rounded-md border border-border bg-muted flex items-center justify-center">
                        <span className="text-[10px] text-muted-foreground">No hay vista previa</span>
                      </div>
                    )}
                    <div className="text-center text-[10px] font-mono bg-background/90 text-foreground rounded px-1 py-0.5 mt-1 shadow">
                      {fmt(hoverTime)}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Timeline drag track */}
          <div className="relative select-none" onMouseLeave={() => setHoverTime(null)}>
            <div className="relative h-5 mb-1">
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 flex flex-col items-center" style={{ left: `${toPercent(t)}%`, transform: 'translateX(-50%)' }}>
                  <div className="w-px h-2 bg-border" />
                  {t % 30 === 0 && <span className="text-[10px] text-muted-foreground mt-0.5">{fmt(t)}</span>}
                </div>
              ))}
            </div>

            <div ref={timelineRef} className="relative h-10 bg-muted rounded-lg overflow-visible cursor-crosshair">
              <div className="absolute inset-y-0 left-0 bg-primary/5 rounded-lg transition-all duration-500" style={{ width: `${toPercent(bufferDuration)}%` }} />
              <div className="absolute inset-y-0 left-0 bg-black/30 rounded-l-lg" style={{ width: `${toPercent(start)}%` }} />
              <div className="absolute inset-y-0 right-0 bg-black/30 rounded-r-lg" style={{ width: `${100 - toPercent(end)}%` }} />

              <div
                className="absolute inset-y-0 border-y-2 border-primary bg-primary/10 cursor-grab active:cursor-grabbing"
                style={{ left: `${toPercent(start)}%`, width: `${toPercent(end) - toPercent(start)}%` }}
                onMouseDown={(e) => onMouseDown(e, 'range')}
              />

              <div className="absolute -top-5 text-[10px] font-mono text-primary font-medium pointer-events-none" style={{ left: `${toPercent(start)}%`, transform: 'translateX(-50%)' }}>
                {fmt(start)}
              </div>
              <div className="absolute -top-5 text-[10px] font-mono text-primary font-medium pointer-events-none" style={{ left: `${toPercent(end)}%`, transform: 'translateX(-50%)' }}>
                {fmt(end)}
              </div>

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
            <span>Total buffered: {fmt(totalDuration)}</span>
            <span className={`font-mono font-medium px-2 py-0.5 rounded ${duration > MAX_CLIP ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
              {fmt(duration)} seleccionada
            </span>
            <span>Max: {fmt(MAX_CLIP)}</span>
          </div>

          {error && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button className="flex-1 gap-2" onClick={handleSaveClick} disabled={!canSave}>
              <Scissors className="w-4 h-4" /> Guardar clip ({fmt(duration)})
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}