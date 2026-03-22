'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Clapperboard } from 'lucide-react';

interface ClipCreatorProps {
  streamUrl: string;
  onClipCreated?: (clip: any) => void;
}

export function ClipCreator({ streamUrl, onClipCreated }: ClipCreatorProps) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleCreateClip = async () => {
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      const response = await fetch('/api/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamUrl,
          title: title || `Clip ${new Date().toLocaleTimeString()}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to create clip');
        return;
      }

      setSuccess(true);
      setTitle('');
      onClipCreated?.(data.clip);

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Connection error. Please try again.');
      console.error('[v0] Clip creation error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 p-4 bg-card border border-border rounded-lg">
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Clip title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading}
        />
        <Button
          onClick={handleCreateClip}
          disabled={loading}
          className="gap-2"
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Clapperboard className="w-4 h-4" />
              Create Clip
            </>
          )}
        </Button>
      </div>

      {loading && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 text-blue-600 rounded text-sm">
          Recording 60s past + 30s future (90s total)...
        </div>
      )}

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/50 text-destructive rounded text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 text-green-600 rounded text-sm">
          Clip created successfully!
        </div>
      )}
    </div>
  );
}
