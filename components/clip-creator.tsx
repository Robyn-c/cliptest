'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clapperboard, Radio, Loader2, CheckCircle2, X } from 'lucide-react';

const POST_SECONDS = 30;

interface ClipCreatorProps {
  onClipCreated?: (clip: any) => void;
}

type Stage = 'idle' | 'waiting' | 'naming' | 'saving';

export function ClipCreator({ onClipCreated }: ClipCreatorProps) {
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferDuration, setBufferDuration] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [countdown, setCountdown] = useState(0);
  const [title, setTitle] = useState('');
  // Lock in the clip window at press time
  const clipWindowRef = useRef<{ start: number; end: number } | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const poll = async () => {
    try {
      const res = await fetch('/api/buffer');
      const data = await res.json();
      setBufferDuration(data.totalDuration || 0);
      setSegmentCount(data.segmentCount || 0);
      setIsBuffering(data.isBuffering ?? false);
      setError(data.error || null);
    } catch { }
  };

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleClip = async () => {
    if (stage !== 'idle') return;

    // Lock in the pre-clip window right now
    const preStart = Math.max(0, bufferDuration - POST_SECONDS);
    clipWindowRef.current = { start: preStart, end: bufferDuration + POST_SECONDS };

    setStage('waiting');
    setCountdown(POST_SECONDS);

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);

    await new Promise(r => setTimeout(r, POST_SECONDS * 1000));
    clearInterval(interval);
    setStage('naming');
  };

  const handleSave = async () => {
    if (!clipWindowRef.current) return;
    setStage('saving');
    setError(null);

    try {
      const res = await fetch('/api/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startSeconds: Math.floor(clipWindowRef.current.start),
          endSeconds: Math.ceil(clipWindowRef.current.end),
          title: title.trim() || `Clip ${new Date().toLocaleTimeString()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed');
      onClipCreated?.(data.clip);
      setStage('idle');
      setTitle('');
      clipWindowRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setStage('naming');
    }
  };

  const handleCancel = () => {
    setStage('idle');
    setTitle('');
    clipWindowRef.current = null;
    setError(null);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const canClip = isBuffering && bufferDuration >= POST_SECONDS && stage === 'idle';

  return (
    <div className="space-y-3 p-4 bg-card border border-border rounded-lg">

      {/* Main clip button */}
      {stage === 'idle' && (
        <Button
          onClick={handleClip}
          disabled={!canClip}
          className="gap-2 w-full"
          size="lg"
        >
          <Clapperboard className="w-4 h-4" />
          {!isBuffering
            ? 'Conectando...'
            : bufferDuration < POST_SECONDS
            ? `Buffering... (${formatTime(bufferDuration)})`
            : 'Crear clip'}
        </Button>
      )}

      {/* Waiting stage — countdown */}
      {stage === 'waiting' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="font-medium">Grabando post-clip...</span>
            </div>
            <span className="font-mono font-bold text-primary">{countdown}s</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-1000"
              style={{ width: `${((POST_SECONDS - countdown) / POST_SECONDS) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Grabando {POST_SECONDS}s de footage posterior al momento del clip
          </p>
        </div>
      )}

      {/* Naming stage */}
      {stage === 'naming' && (
        <div className="space-y-3">
          <p className="text-sm font-medium">✅ Clip listo — ponle un nombre</p>
          <Input
            placeholder="Nombre del clip (opcional)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            autoFocus
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel} className="gap-1">
              <X className="w-3 h-3" /> Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} className="gap-1 flex-1">
              <CheckCircle2 className="w-3 h-3" /> Guardar clip
            </Button>
          </div>
        </div>
      )}

      {/* Saving stage */}
      {stage === 'saving' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Subiendo clip...</span>
        </div>
      )}

      {/* Buffer status */}
      {isBuffering && stage === 'idle' && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-red-500 animate-pulse" />
            <span>Grabando stream</span>
          </div>
          <span className="font-mono font-medium text-foreground">
            {formatTime(bufferDuration)} ({segmentCount} seg)
          </span>
        </div>
      )}

      {!isBuffering && stage === 'idle' && !error && (
        <p className="text-xs text-muted-foreground px-1">Conectando al stream...</p>
      )}

      {error && stage === 'idle' && (
        <p className="text-xs text-destructive px-1">{error}</p>
      )}
    </div>
  );
}