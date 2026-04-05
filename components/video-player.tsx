'use client';
import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

interface VideoPlayerProps {
  streamUrl: string;
  title?: string;
  onClipStart?: () => void;
}

function proxyUrl(url: string) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

export function VideoPlayer({ streamUrl, title = 'Live Stream', onClipStart }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    setIsLoaded(false);
    setError(null);

    // Route through proxy to avoid CORS issues
    const proxied = proxyUrl(streamUrl);
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: false,
        lowLatencyMode: true,
        backBufferLength: 60,
      });
      hls.loadSource(proxied);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoaded(true);
        setError(null);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setError('Error de stream: ' + (data.response?.statusText || 'Unknown error'));
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = proxied;
      setIsLoaded(true);
    } else {
      setError('HLS streaming not supported in this browser');
    }

    return () => { hls?.destroy(); };
  }, [streamUrl]);

  return (
    <div className="space-y-4">
      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-border">
        <video
          ref={videoRef}
          className="w-full h-full"
          controls
          playsInline
        />
        {!isLoaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="text-white/60 text-sm">{title}</div>
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