import { NextRequest, NextResponse } from 'next/server';
import { getBufferStatus, pollBuffer, stopBuffer } from '@/lib/stream-buffer';
import fs from 'fs';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const streamUrl = request.nextUrl.searchParams.get('streamUrl');
  if (!streamUrl) {
    return NextResponse.json({ error: 'streamUrl is required' }, { status: 400 });
  }

  // Debug: check what's on disk
  const stateExists = fs.existsSync('/tmp/hls-buffer/state.json');
  const dirExists = fs.existsSync('/tmp/hls-buffer');
  const dirContents = dirExists ? fs.readdirSync('/tmp/hls-buffer') : [];

  const status = getBufferStatus(streamUrl);
  return NextResponse.json({ ...status, debug: { stateExists, dirExists, dirContents } });
}

export async function POST(request: NextRequest) {
  const { streamUrl, action } = await request.json();
  if (!streamUrl) {
    return NextResponse.json({ error: 'streamUrl is required' }, { status: 400 });
  }

  if (action === 'stop') {
    stopBuffer(streamUrl);
    return NextResponse.json({ success: true });
  }

  // start or poll
  await pollBuffer(streamUrl);
  const status = getBufferStatus(streamUrl);

  const dirContents = fs.existsSync('/tmp/hls-buffer') ? fs.readdirSync('/tmp/hls-buffer') : [];
  return NextResponse.json({ success: true, ...status, debug: { dirContents } });
}