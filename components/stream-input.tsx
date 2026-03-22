'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

interface StreamInputProps {
  onValidStream: (url: string) => void;
  onLoading?: (loading: boolean) => void;
}

export function StreamInput({ onValidStream, onLoading }: StreamInputProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!url.trim()) {
      setError('Please enter a stream URL');
      return;
    }

    setLoading(true);
    setError(null);
    onLoading?.(true);

    try {
      const response = await fetch('/api/validate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamUrl: url }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to validate stream');
        return;
      }

      onValidStream(url);
      setUrl('');
    } catch (err) {
      setError('Connection error. Please try again.');
      console.error('[v0] Validation error:', err);
    } finally {
      setLoading(false);
      onLoading?.(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleValidate();
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="Enter HLS stream URL (m3u8)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={loading}
          className="flex-1"
        />
        <Button
          onClick={handleValidate}
          disabled={loading || !url.trim()}
          className="gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Validating
            </>
          ) : (
            'Load Stream'
          )}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/50 text-destructive rounded text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
