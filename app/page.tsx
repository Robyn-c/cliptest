'use client';
import { useState } from 'react';
import { VideoPlayer } from '@/components/video-player';
import { StreamInput } from '@/components/stream-input';
import { ClipCreator } from '@/components/clip-creator';
import { ClipLibrary } from '@/components/clip-library';

// Hardcoded — single stream app, no need for env var complexity
const STREAM_URL = 'https://unlimited1-cl-isp.dps.live/atv/atv.smil/playlist.m3u8';

export default function Home() {
  const [refreshClips, setRefreshClips] = useState(0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-foreground">Livestream Clipper</h1>
          <p className="text-sm text-muted-foreground">Graba clips de tus streams</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">En vivo</h2>
              <StreamInput streamUrl={STREAM_URL} />
              <VideoPlayer streamUrl={STREAM_URL} />
            </section>
          </div>

          <div className="space-y-6">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Crear Clip</h2>
              <ClipCreator onClipCreated={() => setRefreshClips(p => p + 1)} />
            </section>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Tus Clips</h2>
          <ClipLibrary refreshTrigger={refreshClips} />
        </section>
      </main>
    </div>
  );
}