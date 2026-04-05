import { NextRequest, NextResponse } from 'next/server';
import { sliceBuffer } from '@/lib/stream-buffer';
import { clipStore, type StoredClip } from '@/lib/clip-store';
import { getFfmpegPath } from '@/lib/ffmpeg-helper';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 120;

async function remuxToMp4(tsBuffer: Buffer, clipId: string): Promise<Buffer> {
  const tmpDir = path.join(os.tmpdir(), 'clips');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const tsPath = path.join(tmpDir, `${clipId}-in.ts`);
  const mp4Path = path.join(tmpDir, `${clipId}-out.mp4`);
  fs.writeFileSync(tsPath, tsBuffer);

  await new Promise<void>((resolve, reject) => {
    const ff = spawn(getFfmpegPath(), [
      '-y',
      '-i', tsPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-f', 'mp4',
      mp4Path,
    ]);
    let stderr = '';
    ff.stderr.on('data', (d) => { stderr += d.toString(); });
    ff.on('error', (err) => {
      try { fs.unlinkSync(tsPath); } catch {}
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });
    ff.on('close', (code) => {
      try { fs.unlinkSync(tsPath); } catch {}
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });

  const buf = fs.readFileSync(mp4Path);
  try { fs.unlinkSync(mp4Path); } catch {}
  return buf;
}

export async function POST(request: NextRequest) {
  try {
    const { startSeconds, endSeconds, title } = await request.json();

    if (startSeconds == null || endSeconds == null) {
      return NextResponse.json({ error: 'startSeconds and endSeconds are required' }, { status: 400 });
    }
    if (endSeconds <= startSeconds) {
      return NextResponse.json({ error: 'endSeconds must be greater than startSeconds' }, { status: 400 });
    }
    if (endSeconds - startSeconds > 120) {
      return NextResponse.json({ error: 'Clip cannot exceed 120 seconds' }, { status: 400 });
    }

    console.log(`[clip] Slicing ${startSeconds}s → ${endSeconds}s, ffmpeg: ${getFfmpegPath()}`);

    const tsBuffer = sliceBuffer(startSeconds, endSeconds);
    if (!tsBuffer || tsBuffer.length === 0) {
      return NextResponse.json({ error: 'No buffer available for this time range.' }, { status: 400 });
    }

    const clipId = uuidv4();
    const mp4Buffer = await remuxToMp4(tsBuffer, clipId);
    console.log('[clip] mp4 size:', mp4Buffer.length);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const fileName = `${clipId}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from('clips')
      .upload(fileName, mp4Buffer, { contentType: 'video/mp4', upsert: true });

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const storedClip: StoredClip = {
      id: clipId,
      title: title || `Clip ${new Date().toLocaleTimeString()}`,
      url: `/api/clips/${clipId}/stream`,
      duration: endSeconds - startSeconds,
      createdAt: new Date().toISOString(),
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