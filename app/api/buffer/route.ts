import { NextResponse } from 'next/server';
import { getBufferStatus, ensureBuffering } from '@/lib/stream-buffer';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET() {
  ensureBuffering(); // records client activity + starts poller if needed
  return NextResponse.json(getBufferStatus());
}

export async function POST() {
  ensureBuffering();
  return NextResponse.json(getBufferStatus());
}