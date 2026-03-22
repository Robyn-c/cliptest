import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Validate that a stream URL is valid and accessible
 */
export async function POST(request: NextRequest) {
  try {
    const { streamUrl } = await request.json();

    if (!streamUrl) {
      return NextResponse.json(
        { error: 'streamUrl is required' },
        { status: 400 }
      );
    }

    // Basic URL validation
    try {
      new URL(streamUrl);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Check if URL is accessible (simplified check)
    const response = await fetch(streamUrl, { method: 'HEAD' });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Stream URL is not accessible' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      message: 'Stream URL is valid',
    });
  } catch (error) {
    console.error('[v0] Validate stream error:', error);
    return NextResponse.json(
      { error: 'Failed to validate stream' },
      { status: 500 }
    );
  }
}
