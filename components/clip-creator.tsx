'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Clapperboard, Radio } from 'lucide-react';
import { ClipEditor } from './ClipEditor';

interface ClipCreatorProps {
  onClipCreated?: (clip: any) => void;
}

export function ClipCreator({ onClipCreated }: ClipCreatorProps) {
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferDuration, setBufferDuration] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const poll = async () => {
    try {
      const res = await fetch('/api/buffer');
      const data = await res.json();
      setBufferDuration(data.totalDuration || 0);
      setSegmentCount(data.segmentCount || 0);
      setIsBuffering(data.isBuffering ?? false);
      setError(data.error || null);
    } catch {
      // ignore transient errors
    }
  };

  // Poll every 10s — matches the server poll interval, no need to poll faster
  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 10000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <div className="space-y-3 p-4 bg-card border border-border rounded-lg">
        <div className="flex gap-2">
          <Button
            onClick={() => setShowEditor(true)}
            disabled={!isBuffering || bufferDuration < 10}
            className="gap-2 flex-1"
            size="lg"
          >
            <Clapperboard className="w-4 h-4" />
            {!isBuffering
              ? 'Connecting to stream...'
              : bufferDuration < 10
              ? 'Buffering...'
              : 'Crear clip'}
          </Button>
        </div>

        {isBuffering && (
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-red-500 animate-pulse" />
              <span>Grabando stream</span>
            </div>
            <span className="font-mono font-medium text-foreground">
              {formatTime(bufferDuration)} ({segmentCount} segmentos)
            </span>
          </div>
        )}

        {!isBuffering && !error && (
          <p className="text-xs text-muted-foreground px-1">
            Conectando al stream...
          </p>
        )}

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/50 text-destructive rounded text-sm">
            {error}
          </div>
        )}
      </div>

      {showEditor && (
        <ClipEditor
          bufferDuration={bufferDuration}
          isBuffering={isBuffering}
          onClose={() => setShowEditor(false)}
          onClipCreated={(clip) => {
            setShowEditor(false);
            onClipCreated?.(clip);
          }}
        />
      )}
    </>
  );
}