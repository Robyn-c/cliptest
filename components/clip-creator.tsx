'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Clapperboard, Radio } from 'lucide-react';
import { ClipEditor } from './ClipEditor';

interface ClipCreatorProps {
  streamUrl: string;
  onClipCreated?: (clip: any) => void;
}

export function ClipCreator({ streamUrl, onClipCreated }: ClipCreatorProps) {
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferDuration, setBufferDuration] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const poll = async () => {
    try {
      const res = await fetch('/api/buffer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamUrl, action: 'poll' }),
      });
      const data = await res.json();
      setBufferDuration(data.totalDuration || 0);
      setSegmentCount(data.segmentCount || 0);
      setIsBuffering(data.isBuffering ?? true);
    } catch {
      // ignore transient errors
    }
  };

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(poll, 3000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const handleCreateClip = async () => {
    setError(null);
    setStarting(true);
    try {
      // First poll — starts the buffer and fetches initial segments
      await poll();
      setIsBuffering(true);
      startPolling();

      // Wait a few seconds for segments to accumulate before opening editor
      await new Promise((r) => setTimeout(r, 4000));
      await poll(); // one more poll to get fresh count
    } catch {
      setError('Failed to start buffer. Please try again.');
      setStarting(false);
      return;
    }
    setStarting(false);
    setShowEditor(true);
  };

  const handleClose = () => {
    setShowEditor(false);
    // keep buffering in background
  };

  const handleOpenEditor = () => {
    setShowEditor(true);
  };

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
            onClick={isBuffering ? handleOpenEditor : handleCreateClip}
            disabled={starting}
            className="gap-2 flex-1"
            size="lg"
          >
            {starting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Buffering…</>
            ) : (
              <><Clapperboard className="w-4 h-4" /> {isBuffering ? 'Open Clip Editor' : 'Create Clip'}</>
            )}
          </Button>
        </div>

        {isBuffering && (
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-red-500 animate-pulse" />
              <span>Buffering live stream</span>
            </div>
            <span className="font-mono font-medium text-foreground">
              {formatTime(bufferDuration)} ({segmentCount} segments)
            </span>
          </div>
        )}

        {!isBuffering && !starting && (
          <p className="text-xs text-muted-foreground px-1">
            Click &quot;Create Clip&quot; to start buffering — then trim your clip in the editor.
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
          streamUrl={streamUrl}
          bufferDuration={bufferDuration}
          isBuffering={isBuffering}
          onClose={handleClose}
          onClipCreated={(clip) => {
            setShowEditor(false);
            onClipCreated?.(clip);
          }}
        />
      )}
    </>
  );
}