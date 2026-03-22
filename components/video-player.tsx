'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

interface VideoPlayerProps {
  streamUrl: string;
  title?: string;
  onClipStart?: () => void;
}

export function VideoPlayer({ streamUrl, title = 'Live Stream', onClipStart }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: false,
        lowLatencyMode: true,
        backBufferLength: 60, // Keep 60 seconds in buffer
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[v0] HLS stream loaded');
        setError(null);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error('[v0] HLS error:', data);
          setError('Stream error: ' + data.response?.statusText || 'Unknown error');
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
    } else {
      setError('HLS streaming not supported in this browser');
    }

    return () => {
      hls?.destroy();
    };
  }, [streamUrl]);

  return (
    <div className="space-y-4">
      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-border">
        <video
          ref={videoRef}
          className="w-full h-full"
          controls
          autoPlay
          muted
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="text-center">
              <div className="text-white text-lg font-medium">{title}</div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/50 text-destructive rounded-lg text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
