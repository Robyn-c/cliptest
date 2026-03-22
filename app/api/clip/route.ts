import { NextRequest, NextResponse } from 'next/server';
import { sliceBuffer } from '@/lib/stream-buffer';
import { clipStore, type StoredClip } from '@/lib/clip-store';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const maxDuration = 120;

async function remuxToMp4(tsBuffer: Buffer, clipId: string): Promise<Buffer> {
  const tmpDir = path.join(os.tmpdir(), 'clips');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const tsPath = path.join(tmpDir, `${clipId}-in.ts`);
  const mp4Path = path.join(tmpDir, `${clipId}-out.mp4`);

  fs.writeFileSync(tsPath, tsBuffer);

  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

  await new Promise<void>((resolve, reject) => {
    const ff = spawn(ffmpegPath, [
      '-y', '-i', tsPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-f', 'mp4',
      mp4Path,
    ]);
    let stderr = '';
    ff.stderr.on('data', (d) => { stderr += d.toString(); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      try { fs.unlinkSync(tsPath); } catch { /* ignore */ }
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${stderr}`));
    });
  });

  const mp4Buffer = fs.readFileSync(mp4Path);
  try { fs.unlinkSync(mp4Path); } catch { /* ignore */ }
  return mp4Buffer;
}

export async function POST(request: NextRequest) {
  try {
    const { streamUrl, startSeconds, endSeconds, title } = await request.json();

    if (!streamUrl || startSeconds == null || endSeconds == null) {
      return NextResponse.json(
        { error: 'streamUrl, startSeconds, endSeconds are required' },
        { status: 400 }
      );
    }

    if (endSeconds <= startSeconds) {
      return NextResponse.json({ error: 'endSeconds must be greater than startSeconds' }, { status: 400 });
    }

    const duration = endSeconds - startSeconds;
    if (duration > 120) {
      return NextResponse.json({ error: 'Clip cannot exceed 120 seconds' }, { status: 400 });
    }

    console.log(`[clip] Slicing buffer ${startSeconds}s → ${endSeconds}s`);

    const tsBuffer = sliceBuffer(streamUrl, startSeconds, endSeconds);
    if (!tsBuffer) {
      return NextResponse.json(
        { error: 'No buffer available. Start buffering the stream first.' },
        { status: 400 }
      );
    }

    const clipId = uuidv4();
    let fileBuffer: Buffer;
    let fileName: string;
    let contentType: string;

    try {
      fileBuffer = await remuxToMp4(tsBuffer, clipId);
      fileName = `${clipId}.mp4`;
      contentType = 'video/mp4';
      console.log('[clip] Remuxed to mp4, size:', fileBuffer.length);
    } catch (err) {
      console.warn('[clip] FFmpeg not available, uploading as .ts:', err);
      fileBuffer = tsBuffer;
      fileName = `${clipId}.ts`;
      contentType = 'video/mp2t';
    }

    // Upload to Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error: uploadError } = await supabase.storage
      .from('clips')
      .upload(fileName, fileBuffer, { contentType, upsert: true });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const storedClip: StoredClip = {
      id: clipId,
      title: title || `Clip ${new Date().toLocaleTimeString()}`,
      url: `/api/clips/${clipId}/stream`,
      duration,
      createdAt: new Date().toISOString(),
      streamUrl,
    };

    clipStore.addClip(storedClip);

    return NextResponse.json({ success: true, clip: storedClip });
  } catch (error) {
    console.error('[clip] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create clip', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}