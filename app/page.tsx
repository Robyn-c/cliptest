'use client';

import { useState } from 'react';
import { VideoPlayer } from '@/components/video-player';
import { StreamInput } from '@/components/stream-input';
import { ClipCreator } from '@/components/clip-creator';
import { ClipLibrary } from '@/components/clip-library';

export default function Home() {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [refreshClips, setRefreshClips] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const handleValidStream = (url: string) => {
    setStreamUrl(url);
  };

  const handleClipCreated = () => {
    setRefreshClips((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Livestream Clipper</h1>
              <p className="text-sm text-muted-foreground">Record clips from your HLS streams</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Stream Input Section */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Connect Stream</h2>
          <StreamInput onValidStream={handleValidStream} onLoading={setIsLoading} />
        </section>

        {/* Player and Clip Creator */}
        {streamUrl ? (
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Live Feed</h2>
                <VideoPlayer streamUrl={streamUrl} />
              </section>
            </div>

            <div className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Create Clip</h2>
                <ClipCreator streamUrl={streamUrl} onClipCreated={handleClipCreated} />
              </section>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
            <div className="space-y-3">
              <div className="text-base font-medium text-muted-foreground">
                No stream connected
              </div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Enter an HLS (m3u8) stream URL above to get started
              </p>
            </div>
          </div>
        )}

        {/* Clip Library Section */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Your Clips</h2>
          <ClipLibrary refreshTrigger={refreshClips} />
        </section>
      </main>
    </div>
  );
}
