/**
 * Disk-based HLS stream buffer
 * 
 * Key changes for resource efficiency:
 * - Only buffers while clients are actively watching (stops after 2min inactivity)
 * - Polls every 12s (matches typical HLS segment duration)
 * - Keeps only 70s of segments (enough for 30s pre + 30s post + margin)
 * - Recalculates duration from segments to avoid drift
 */

import fs from 'fs';
import path from 'path';

const STREAM_URL = process.env.STREAM_URL || 'https://unlimited1-cl-isp.dps.live/atv/atv.smil/playlist.m3u8';
const BUFFER_DIR = '/tmp/hls-buffer';
const MAX_BUFFER_SECONDS = 70;
const POLL_INTERVAL_MS = 12000;
// Stop buffering after this many ms with no client activity
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const STATE_FILE = path.join(BUFFER_DIR, 'state.json');

interface SegmentMeta {
  url: string;
  duration: number;
  fetchedAt: number;
  file: string;
}

interface BufferState {
  isBuffering: boolean;
  segments: SegmentMeta[];
  totalDuration: number;
  lastPollAt: number;
  error: string | null;
}

// ─── In-memory poller state ───────────────────────────────────────────────────
let pollerTimer: ReturnType<typeof setTimeout> | null = null;
let lastClientActivityAt = 0;
let isPollerRunning = false;

// ─── Disk helpers ─────────────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(BUFFER_DIR)) fs.mkdirSync(BUFFER_DIR, { recursive: true });
}

function readState(): BufferState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch { }
  return { isBuffering: false, segments: [], totalDuration: 0, lastPollAt: 0, error: null };
}

function writeState(state: BufferState) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function deleteSegmentFile(file: string) {
  try { fs.unlinkSync(path.join(BUFFER_DIR, file)); } catch { }
}

// ─── HLS fetching ─────────────────────────────────────────────────────────────

function getBrowserHeaders(url: string) {
  const origin = new URL(url).origin;
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Referer': origin + '/',
    'Origin': origin,
  };
}

async function fetchPlaylist(masterUrl: string): Promise<{ mediaUrl: string; playlist: string }> {
  const masterRes = await fetch(masterUrl, {
    headers: getBrowserHeaders(masterUrl),
    signal: AbortSignal.timeout(10000), // 10s timeout
  });
  const masterText = await masterRes.text();

  if (!masterText.includes('#EXT-X-STREAM-INF')) {
    return { mediaUrl: masterUrl, playlist: masterText };
  }

  const lines = masterText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('#EXT-X-STREAM-INF')) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next && !next.startsWith('#')) {
          let mediaUrl: string;
          if (next.startsWith('http')) mediaUrl = next;
          else if (next.startsWith('/')) mediaUrl = new URL(masterUrl).origin + next;
          else mediaUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1) + next;

          const mediaRes = await fetch(mediaUrl, {
            cache: 'no-store',
            headers: getBrowserHeaders(mediaUrl),
            signal: AbortSignal.timeout(10000),
          });
          return { mediaUrl, playlist: await mediaRes.text() };
        }
      }
    }
  }
  return { mediaUrl: masterUrl, playlist: masterText };
}

// ─── One poll cycle ───────────────────────────────────────────────────────────

async function runOnePoll(): Promise<void> {
  ensureDir();
  const state = readState();
  const seen = new Set(state.segments.map(s => s.url));

  try {
    const { mediaUrl, playlist } = await fetchPlaylist(STREAM_URL);
    const baseUrl = mediaUrl.substring(0, mediaUrl.lastIndexOf('/') + 1);
    const lines = playlist.split('\n');
    let segDuration = 6;
    let newCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        const m = line.match(/#EXTINF:([\d.]+)/);
        if (m) segDuration = parseFloat(m[1]);
      }
      if (line && !line.startsWith('#')) {
        const segUrl = line.startsWith('http') ? line : baseUrl + line;
        if (!seen.has(segUrl)) {
          seen.add(segUrl);
          try {
            const res = await fetch(segUrl, {
              headers: getBrowserHeaders(segUrl),
              signal: AbortSignal.timeout(15000),
            });
            if (!res.ok) continue;
            const buf = Buffer.from(await res.arrayBuffer());
            const fileName = `seg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}.ts`;
            fs.writeFileSync(path.join(BUFFER_DIR, fileName), buf);
            state.segments.push({ url: segUrl, duration: segDuration, fetchedAt: Date.now(), file: fileName });
            newCount++;
          } catch { /* segment fetch failed, skip */ }
        }
      }
    }

    // Trim to MAX_BUFFER_SECONDS
    while (state.segments.length > 0) {
      const total = state.segments.reduce((s, x) => s + x.duration, 0);
      if (total <= MAX_BUFFER_SECONDS) break;
      const removed = state.segments.shift()!;
      deleteSegmentFile(removed.file);
    }

    state.totalDuration = state.segments.reduce((s, x) => s + x.duration, 0);
    state.isBuffering = true;
    state.error = null;
    state.lastPollAt = Date.now();

    if (newCount > 0) {
      console.log(`[buffer] +${newCount} segments | ${state.totalDuration.toFixed(1)}s buffered`);
    }
  } catch (err) {
    state.error = (err as Error).message;
    console.error('[buffer] Poll error:', state.error);
  }

  writeState(state);
}

// ─── Poller lifecycle ─────────────────────────────────────────────────────────

function stopPoller() {
  if (pollerTimer) {
    clearTimeout(pollerTimer);
    pollerTimer = null;
  }
  isPollerRunning = false;

  // Mark buffer as not buffering
  const state = readState();
  state.isBuffering = false;
  writeState(state);
  console.log('[buffer] Poller stopped due to inactivity');
}

function scheduleNextPoll() {
  if (pollerTimer) clearTimeout(pollerTimer);
  pollerTimer = setTimeout(async () => {
    // Check if clients are still active
    const inactiveMs = Date.now() - lastClientActivityAt;
    if (inactiveMs > INACTIVITY_TIMEOUT_MS) {
      stopPoller();
      return;
    }
    await runOnePoll();
    scheduleNextPoll();
  }, POLL_INTERVAL_MS);
}

function startPoller() {
  if (isPollerRunning) return;
  isPollerRunning = true;
  console.log('[buffer] Starting poller for:', STREAM_URL);
  ensureDir();
  // Run first poll immediately, then schedule
  runOnePoll().then(() => scheduleNextPoll());
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called by the API route on every client poll.
 * Records activity so the poller knows clients are watching.
 * Starts the poller if it was stopped due to inactivity.
 */
export function ensureBuffering() {
  lastClientActivityAt = Date.now();
  if (!isPollerRunning) {
    startPoller();
  }
}

export function getBufferStatus() {
  const state = readState();
  return {
    isBuffering: state.isBuffering,
    totalDuration: state.totalDuration,
    segmentCount: state.segments.length,
    lastPollAt: state.lastPollAt,
    error: state.error,
  };
}

export function sliceBuffer(startSeconds: number, endSeconds: number): Buffer | null {
  const state = readState();
  if (!state || state.segments.length === 0) return null;

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