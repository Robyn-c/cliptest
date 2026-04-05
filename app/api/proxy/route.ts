/**
 * HLS proxy — forwards playlist and segment requests through the server
 * so the browser never makes cross-origin requests to the stream server.
 *
 * Usage:
 *   Playlist: /api/proxy?url=https://example.com/stream.m3u8
 *   Segments: /api/proxy?url=https://example.com/segment.ts
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ALLOWED_EXTENSIONS = ['.m3u8', '.ts', '.aac', '.mp4', '.m4s', '.key'];

function getBrowserHeaders(url: string) {
  const origin = new URL(url).origin;
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': origin + '/',
    'Origin': origin,
  };
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
  }

  // Basic safety check — only proxy stream files
  const urlPath = new URL(url).pathname;
  const isAllowed = ALLOWED_EXTENSIONS.some(ext => urlPath.endsWith(ext)) || urlPath.includes('.m3u8') || urlPath.includes('.ts');
  if (!isAllowed) {
    return NextResponse.json({ error: 'URL type not allowed' }, { status: 403 });
  }

  try {
    const response = await fetch(url, {
      headers: getBrowserHeaders(url),
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = await response.arrayBuffer();

    // If it's a playlist, rewrite all URLs to go through this proxy
    if (urlPath.endsWith('.m3u8') || contentType.includes('mpegurl')) {
      const text = new TextDecoder().decode(buffer);
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;

        // Build absolute URL for this segment/playlist
        let absoluteUrl: string;
        if (trimmed.startsWith('http')) {
          absoluteUrl = trimmed;
        } else if (trimmed.startsWith('/')) {
          absoluteUrl = new URL(url).origin + trimmed;
        } else {
          absoluteUrl = baseUrl + trimmed;
        }

        return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
      }).join('\n');

      return new NextResponse(rewritten, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // For segments, stream the bytes directly
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('[proxy] Error:', err);
    return NextResponse.json(
      { error: 'Proxy error', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}