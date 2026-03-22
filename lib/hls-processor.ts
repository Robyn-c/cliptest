import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';

export interface ClipResult {
  id: string;
  filePath: string;
  duration: number;
  createdAt: string;
}

export interface ClipOptions {
  streamUrl: string;
  duration: number;
}

/**
 * Check if FFmpeg is available on the system
 */
function checkFfmpeg(): string | null {
  if (process.env.FFMPEG_PATH) {
    console.log('[v0] Using FFMPEG_PATH:', process.env.FFMPEG_PATH);
    return process.env.FFMPEG_PATH;
  }
  try {
    const result = execSync('which ffmpeg 2>/dev/null || where ffmpeg 2>nul', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    return result.split('\n')[0] || null;
  } catch {
    return null;
  }
}

/**
 * Record HLS stream using FFmpeg (if available)
 */
export async function processHlsClip(options: ClipOptions): Promise<ClipResult> {
  const { streamUrl, duration } = options;
  const clipId = uuidv4();
  const outputDir = path.join(os.tmpdir(), 'clips');
  const outputPath = path.join(outputDir, `${clipId}.mp4`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const ffmpegPath = checkFfmpeg();

  if (ffmpegPath) {
    console.log('[v0] Using FFmpeg at:', ffmpegPath);
    return recordWithFfmpeg(ffmpegPath, streamUrl, outputPath, duration, clipId);
  } else {
    console.log('[v0] FFmpeg not found, using segment download fallback');
    return downloadSegments(streamUrl, outputPath, duration, clipId);
  }
}

/**
 * Record stream using FFmpeg
 */
async function recordWithFfmpeg(
  ffmpegPath: string,
  streamUrl: string,
  outputPath: string,
  duration: number,
  clipId: string
): Promise<ClipResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',                       // Overwrite output
      '-i', streamUrl,            // Input URL
      '-t', String(duration),     // Duration
      '-c:v', 'copy',             // Copy video
      '-c:a', 'copy',             // Copy audio
      '-movflags', '+faststart',  // Enable streaming
      '-f', 'mp4',                // Output format
      outputPath,                 // Output file
    ];

    console.log('[v0] FFmpeg command:', ffmpegPath, args.join(' '));

    const ffmpeg = spawn(ffmpegPath, args);
    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
      const line = data.toString().trim();
      if (line.includes('time=')) {
        console.log('[v0] FFmpeg:', line.substring(line.indexOf('time=')));
      }
    });

    ffmpeg.on('error', (err) => {
      console.error('[v0] FFmpeg spawn error:', err);
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          console.log('[v0] Output file size:', stats.size, 'bytes');

          if (stats.size > 0) {
            resolve({
              id: clipId,
              filePath: outputPath,
              duration: duration,
              createdAt: new Date().toISOString(),
            });
          } else {
            reject(new Error('Output file is empty'));
          }
        } else {
          reject(new Error('Output file was not created'));
        }
      } else {
        console.error('[v0] FFmpeg stderr:', stderr);
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

/**
 * Remux a .ts file to .mp4 using FFmpeg
 */
async function remuxTsToMp4(
  ffmpegPath: string,
  tsPath: string,
  mp4Path: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, [
      '-y',
      '-i', tsPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-f', 'mp4',
      mp4Path,
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`FFmpeg remux spawn error: ${err.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        // Clean up the .ts file
        try { fs.unlinkSync(tsPath); } catch { /* ignore */ }
        resolve();
      } else {
        console.error('[v0] FFmpeg remux stderr:', stderr);
        reject(new Error(`FFmpeg remux exited with code ${code}`));
      }
    });
  });
}

/**
 * Fallback: Download HLS segments directly
 */
async function downloadSegments(
  m3u8Url: string,
  outputPath: string, // always .mp4
  durationSeconds: number,
  clipId: string
): Promise<ClipResult> {
  console.log('[v0] Downloading HLS segments from:', m3u8Url);

  // Fetch the m3u8 playlist
  const response = await fetch(m3u8Url);
  let playlist = await response.text();
  let mediaPlaylistUrl = m3u8Url;

  // Check if this is a master playlist
  if (playlist.includes('#EXT-X-STREAM-INF')) {
    console.log('[v0] Master playlist detected');
    const lines = playlist.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine && !nextLine.startsWith('#')) {
            mediaPlaylistUrl = nextLine.startsWith('http')
              ? nextLine
              : m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1) + nextLine;
            break;
          }
        }
        break;
      }
    }

    console.log('[v0] Using media playlist:', mediaPlaylistUrl);
    const mediaResponse = await fetch(mediaPlaylistUrl);
    playlist = await mediaResponse.text();
  }

  // Parse segments with byte ranges
  const lines = playlist.split('\n');
  const segments: Array<{ url: string; byteRange?: { length: number; offset: number } }> = [];
  let currentDuration = 0;
  let segmentDuration = 6;
  let currentByteRange: { length: number; offset: number } | undefined;
  let lastOffset = 0;
  const baseUrl = mediaPlaylistUrl.substring(0, mediaPlaylistUrl.lastIndexOf('/') + 1);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      const match = line.match(/#EXTINF:([\d.]+)/);
      if (match) {
        segmentDuration = parseFloat(match[1]);
      }
    }

    if (line.startsWith('#EXT-X-BYTERANGE:')) {
      const match = line.match(/#EXT-X-BYTERANGE:(\d+)(?:@(\d+))?/);
      if (match) {
        const length = parseInt(match[1], 10);
        const offset = match[2] ? parseInt(match[2], 10) : lastOffset;
        currentByteRange = { length, offset };
        lastOffset = offset + length;
      }
    }

    if (line && !line.startsWith('#')) {
      const segmentUrl = line.startsWith('http') ? line : baseUrl + line;
      segments.push({
        url: segmentUrl,
        byteRange: currentByteRange,
      });
      currentByteRange = undefined;
      currentDuration += segmentDuration;

      if (currentDuration >= durationSeconds) {
        break;
      }
    }
  }

  console.log(`[v0] Found ${segments.length} segments, ~${currentDuration}s`);

  if (segments.length === 0) {
    throw new Error('No segments found in playlist');
  }

  // Download segments
  const buffers: Buffer[] = [];
  for (const segment of segments) {
    const headers: HeadersInit = {};

    if (segment.byteRange) {
      const end = segment.byteRange.offset + segment.byteRange.length - 1;
      headers['Range'] = `bytes=${segment.byteRange.offset}-${end}`;
    }

    try {
      const segResponse = await fetch(segment.url, { headers });
      const arrayBuffer = await segResponse.arrayBuffer();
      buffers.push(Buffer.from(arrayBuffer));
      console.log('[v0] Downloaded segment:', segment.url.substring(segment.url.lastIndexOf('/') + 1));
    } catch (err) {
      console.error('[v0] Failed to download segment:', err);
    }
  }

  // Concatenate segments into a .ts file first
  const outputBuffer = Buffer.concat(buffers);
  const tsPath = outputPath.replace('.mp4', '.ts');
  fs.writeFileSync(tsPath, outputBuffer);
  console.log('[v0] Saved .ts file:', tsPath, 'size:', outputBuffer.length);

  // Try to remux .ts -> .mp4 with FFmpeg for browser compatibility
  const ffmpegPath = checkFfmpeg();
  if (ffmpegPath) {
    console.log('[v0] Remuxing .ts to .mp4 with FFmpeg...');
    try {
      await remuxTsToMp4(ffmpegPath, tsPath, outputPath);
      console.log('[v0] Remux complete:', outputPath);
      return {
        id: clipId,
        filePath: outputPath, // .mp4 - plays in browsers
        duration: currentDuration,
        createdAt: new Date().toISOString(),
      };
    } catch (remuxError) {
      console.error('[v0] Remux failed, falling back to .ts:', remuxError);
    }
  }

  // No FFmpeg available - return .ts with a warning
  console.warn('[v0] No FFmpeg available - returning .ts file. Set FFMPEG_PATH env var for browser-compatible .mp4 output.');
  return {
    id: clipId,
    filePath: tsPath,
    duration: currentDuration,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Upload clip to Supabase storage
 * Uses service role key directly to bypass RLS
 */
export async function uploadClipToStorage(
  filePath: string,
  clipId: string
): Promise<string> {
  console.log('[v0] Uploading clip to Supabase storage:', clipId);

  // Admin client bypasses RLS - never expose this key client-side
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const fileBuffer = fs.readFileSync(filePath);
  const isTs = filePath.endsWith('.ts');
  const fileName = `${clipId}.${isTs ? 'ts' : 'mp4'}`;
  const contentType = isTs ? 'video/mp2t' : 'video/mp4';

  const { data, error } = await supabase.storage
    .from('clips')
    .upload(fileName, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error('[v0] Supabase storage error:', error);
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  console.log('[v0] Upload successful:', data.path);

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('clips')
    .getPublicUrl(fileName);

  // Clean up temp file
  try {
    fs.unlinkSync(filePath);
    console.log('[v0] Temp file cleaned up');
  } catch (e) {
    console.warn('[v0] Failed to clean up temp file:', e);
  }

  return urlData.publicUrl;
}