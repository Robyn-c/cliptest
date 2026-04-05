import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BUFFER_DIR = '/tmp/hls-buffer';
const THUMB_DIR = '/tmp/hls-thumbs';
const THUMB_COUNT = 8;

async function extractThumbnail(
  inputFile: string,
  outputFile: string,
  timeOffset: number
): Promise<boolean> {
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  return new Promise((resolve) => {
    const ff = spawn(ffmpegPath, [
      '-y',
      '-ss', String(timeOffset),
      '-i', inputFile,
      '-vframes', '1',
      '-vf', 'scale=160:90',
      '-f', 'image2',
      outputFile,
    ]);
    ff.on('close', (code) => resolve(code === 0));
    ff.on('error', () => resolve(false));
  });
}

export async function GET() {
  const stateFile = path.join(BUFFER_DIR, 'state.json');
  if (!fs.existsSync(stateFile)) {
    return NextResponse.json({ thumbnails: [] });
  }

  let state: any;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  } catch {
    return NextResponse.json({ thumbnails: [] });
  }

  if (!state.segments || state.segments.length === 0) {
    return NextResponse.json({ thumbnails: [] });
  }

  if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });

  const totalDuration = state.totalDuration as number;
  const segments = state.segments as any[];

  const timestamps: number[] = [];
  for (let i = 0; i < THUMB_COUNT; i++) {
    timestamps.push((i / (THUMB_COUNT - 1)) * totalDuration);
  }

  const thumbnails: { time: number; dataUrl: string }[] = [];

  for (const targetTime of timestamps) {
    let cursor = 0;
    let targetSeg: any = null;
    let segOffset = 0;

    for (const seg of segments) {
      const segEnd = cursor + seg.duration;
      if (targetTime >= cursor && targetTime < segEnd) {
        targetSeg = seg;
        segOffset = targetTime - cursor;
        break;
      }
      cursor = segEnd;
    }

    if (!targetSeg) {
      targetSeg = segments[segments.length - 1];
      segOffset = 0;
    }

    const segPath = path.join(BUFFER_DIR, targetSeg.file);
    if (!fs.existsSync(segPath)) continue;

    const thumbName = `thumb-${targetSeg.file.replace('.ts', '')}-${Math.floor(segOffset)}.jpg`;
    const thumbPath = path.join(THUMB_DIR, thumbName);

    if (!fs.existsSync(thumbPath)) {
      const ok = await extractThumbnail(segPath, thumbPath, segOffset);
      if (!ok) continue;
    }

    if (!fs.existsSync(thumbPath)) continue;

    const imgBuffer = fs.readFileSync(thumbPath);
    thumbnails.push({
      time: targetTime,
      dataUrl: `data:image/jpeg;base64,${imgBuffer.toString('base64')}`,
    });
  }

  return NextResponse.json({ thumbnails, totalDuration });
}