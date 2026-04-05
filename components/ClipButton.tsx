'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Scissors, Loader2, Radio } from 'lucide-react';
import { ClipEditor } from './ClipEditor';

interface ClipButtonProps {
  streamUrl: string;
  onClipCreated?: () => void;
}

export function ClipButton({ streamUrl, onClipCreated }: ClipButtonProps) {
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferDuration, setBufferDuration] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [starting, setStarting] = useState(false);

  // Poll buffer status every 2s while buffering
  useEffect(() => {
    if (!isBuffering) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/buffer?streamUrl=${encodeURIComponent(streamUrl)}`);
        const data = await res.json();
        setBufferDuration(data.totalDuration || 0);
        setIsBuffering(data.isBuffering);
      } catch {
        // ignore
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isBuffering, streamUrl]);

  const startBuffering = async () => {
    setStarting(true);
    try {
      await fetch('/api/buffer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamUrl, action: 'start' }),
      });
      setIsBuffering(true);
    } finally {
      setStarting(false);
    }
  };

  const handleClipClick = async () => {
    if (!isBuffering) {
      await startBuffering();
    }
    if (bufferDuration < 5) {
      // Wait a moment for buffer to fill
      await new Promise((r) => setTimeout(r, 3000));
    }
    setShowEditor(true);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {isBuffering && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className="w-3 h-3 text-red-500 animate-pulse" />
            <span className="font-mono">{Math.floor(bufferDuration)}s grabados</span>
          </div>
        )}
        <Button
          onClick={handleClipClick}
          disabled={starting}
          variant="outline"
          className="gap-2"
        >
          {starting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Iniciando...</>
          ) : (
            <><Scissors className="w-4 h-4" /> Clip</>
          )}
        </Button>
      </div>

      {showEditor && (
        <ClipEditor
          streamUrl={streamUrl}
          bufferDuration={bufferDuration}
          onClose={() => setShowEditor(false)}
          onClipCreated={() => {
            setShowEditor(false);
            onClipCreated?.();
          }}
        />
      )}
    </>
  );
}
