'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Play } from 'lucide-react';

interface Clip {
  id: string;
  title: string;
  url: string;
  duration: number;
  createdAt: string;
}

interface ClipLibraryProps {
  refreshTrigger?: number;
}

export function ClipLibrary({ refreshTrigger }: ClipLibraryProps) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchClips();
  }, [refreshTrigger]);

  const fetchClips = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/clips');
      const data = await response.json();
      if (data.clips) {
        setClips(data.clips);
      }
    } catch (err) {
      console.error('[v0] Fetch clips error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (clipId: string) => {
    if (!confirm('Delete this clip?')) return;

    try {
      const response = await fetch(`/api/clips?id=${clipId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setClips(clips.filter((c) => c.id !== clipId));
      }
    } catch (err) {
      console.error('[v0] Delete error:', err);
    }
  };

  if (loading && clips.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">Cargando clips...</div>;
  }

  if (clips.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <div className="text-lg font-medium mb-2">No hay clips todavía</div>
        <div className="text-sm">Crea tu primer clip usando el botón de arriba</div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {clips.map((clip) => (
        <div
          key={clip.id}
          className="group relative overflow-hidden bg-card border border-border rounded-lg hover:border-accent transition-colors"
        >
          <a
            href={clip.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block aspect-video bg-black relative overflow-hidden"
          >
            <video
              src={clip.url}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Play className="w-12 h-12 text-white" />
            </div>
          </a>

          <div className="p-3 space-y-2">
            <h3 className="font-medium text-sm line-clamp-1">{clip.title}</h3>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{Math.round(clip.duration)}s</span>
              <span>{new Date(clip.createdAt).toLocaleTimeString()}</span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="w-full gap-2"
              onClick={() => handleDelete(clip.id)}
            >
              <Trash2 className="w-4 h-4" />
              Borrar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
