/**
 * Disk-based HLS stream buffer
 * Stores segments in /tmp so they persist across Next.js function invocations
 */

import fs from 'fs';
import path from 'path';

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

const BUFFER_DIR = '/tmp/hls-buffer';
const MAX_BUFFER_SECONDS = 180;
const STATE_FILE = path.join(BUFFER_DIR, 'state.json');
const SEEN_FILE = path.join(BUFFER_DIR, 'seen.json');

interface SegmentMeta {
  url: string;
  duration: number;
  fetchedAt: number;
  file: string;
}

interface BufferState {
  streamUrl: string;
  isBuffering: boolean;
  segments: SegmentMeta[];
  totalDuration: number;
}

function ensureDir() {
  if (!fs.existsSync(BUFFER_DIR)) fs.mkdirSync(BUFFER_DIR, { recursive: true });
}

function readState(): BufferState | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeState(state: BufferState) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

export function getBufferStatus(streamUrl: string) {
  const state = readState();
  if (!state || state.streamUrl !== streamUrl) {
    return { isBuffering: false, totalDuration: 0, segmentCount: 0 };
  }
  return {
    isBuffering: state.isBuffering,
    totalDuration: state.totalDuration,
    segmentCount: state.segments.length,
  };
}

/**
 * Fetches master playlist and immediately fetches the media playlist
 * in one chain to avoid token expiry between requests
 */
async function fetchPlaylist(masterUrl: string): Promise<{ mediaUrl: string; playlist: string }> {
  console.log('[buffer] fetching master playlist:', masterUrl);
  const masterRes = await fetch(masterUrl, { headers: getBrowserHeaders(masterUrl) });
  console.log('[buffer] master status:', masterRes.status);
  const masterText = await masterRes.text();

  // If it's already a media playlist (has EXTINF), return directly
  if (!masterText.includes('#EXT-X-STREAM-INF')) {
    return { mediaUrl: masterUrl, playlist: masterText };
  }

  // Parse first stream URL from master playlist
  const lines = masterText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('#EXT-X-STREAM-INF')) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next && !next.startsWith('#')) {
          let mediaUrl: string;
          if (next.startsWith('http')) {
            mediaUrl = next;
          } else if (next.startsWith('/')) {
            // Absolute path — use origin only
            const origin = new URL(masterUrl).origin;
            mediaUrl = origin + next;
          } else {
            // Relative path — use base dir
            mediaUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1) + next;
          }

          console.log('[buffer] fetching media playlist immediately:', mediaUrl);
          // Fetch media playlist right away — token expires quickly
          const mediaRes = await fetch(mediaUrl, { cache: 'no-store', headers: getBrowserHeaders(mediaUrl) });
          console.log('[buffer] media playlist status:', mediaRes.status);
          const playlist = await mediaRes.text();
          console.log('[buffer] media playlist length:', playlist.length, 'preview:', playlist.substring(0, 100));
          return { mediaUrl, playlist };
        }
      }
    }
  }

  return { mediaUrl: masterUrl, playlist: masterText };
}

/**
 * Run one poll cycle — called by the client every 3s
 */
export async function pollBuffer(streamUrl: string): Promise<void> {
  console.log('[buffer] pollBuffer called for:', streamUrl);
  ensureDir();

  let state = readState();
  if (!state || state.streamUrl !== streamUrl) {
    state = { streamUrl, isBuffering: true, segments: [], totalDuration: 0 };
  }
  state.isBuffering = true;

  let seen: Set<string>;
  try {
    seen = new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf-8')));
  } catch {
    seen = new Set();
  }

  try {
    const { mediaUrl, playlist } = await fetchPlaylist(streamUrl);
    const baseUrl = mediaUrl.substring(0, mediaUrl.lastIndexOf('/') + 1);
    const lines = playlist.split('\n');
    let segDuration = 6;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        const match = line.match(/#EXTINF:([\d.]+)/);
        if (match) segDuration = parseFloat(match[1]);
      }
      if (line && !line.startsWith('#')) {
        const segUrl = line.startsWith('http') ? line : baseUrl + line;
        if (!seen.has(segUrl)) {
          seen.add(segUrl);
          try {
            const segRes = await fetch(segUrl, { headers: getBrowserHeaders(segUrl) });
            const buf = Buffer.from(await segRes.arrayBuffer());
            const fileName = `seg-${Date.now()}.ts`;
            fs.writeFileSync(path.join(BUFFER_DIR, fileName), buf);
            state.segments.push({ url: segUrl, duration: segDuration, fetchedAt: Date.now(), file: fileName });
            state.totalDuration += segDuration;
            console.log(`[buffer] +${segDuration}s → total ${state.totalDuration.toFixed(1)}s`);
          } catch (err) {
            console.error('[buffer] Segment fetch error:', err);
          }
        }
      }
    }

    // Trim beyond max
    while (state.totalDuration > MAX_BUFFER_SECONDS && state.segments.length > 0) {
      const removed = state.segments.shift()!;
      state.totalDuration -= removed.duration;
      try { fs.unlinkSync(path.join(BUFFER_DIR, removed.file)); } catch { /* ignore */ }
    }
  } catch (err) {
    console.error('[buffer] Poll error:', (err as Error).message, (err as Error).stack);
  }

  writeState(state);
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen]));
}

export function stopBuffer(streamUrl: string): void {
  const state = readState();
  if (!state) return;
  state.isBuffering = false;
  writeState(state);
}

export function sliceBuffer(
  streamUrl: string,
  startSeconds: number,
  endSeconds: number
): Buffer | null {
  const state = readState();
  if (!state || state.streamUrl !== streamUrl || state.segments.length === 0) return null;

  const chunks: Buffer[] = [];
  let cursor = 0;

  for (const seg of state.segments) {
    const segEnd = cursor + seg.duration;
    if (segEnd > startSeconds && cursor < endSeconds) {
      const filePath = path.join(BUFFER_DIR, seg.file);
      if (fs.existsSync(filePath)) chunks.push(fs.readFileSync(filePath));
    }
    cursor = segEnd;
    if (cursor >= endSeconds) break;
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : null;
}