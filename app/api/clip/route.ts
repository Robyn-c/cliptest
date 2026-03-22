import { NextRequest, NextResponse } from 'next/server';
import { processHlsClip, uploadClipToStorage } from '@/lib/hls-processor';
import { clipStore, type StoredClip } from '@/lib/clip-store';
import fs from 'fs';

export const maxDuration = 120; // 2 minutes for FFmpeg recording

/**
 * Trigger clip creation from HLS stream
 * Records stream content using FFmpeg
 */
export async function POST(request: NextRequest) {
  try {
    const { streamUrl, title } = await request.json();

    if (!streamUrl) {
      return NextResponse.json(
        { error: 'streamUrl is required' },
        { status: 400 }
      );
    }

    console.log('[v0] Starting FFmpeg clip process for:', streamUrl);

    // Process HLS stream using FFmpeg - record 30 seconds
    const clipResult = await processHlsClip({
      streamUrl,
      duration: 30,
    });

    console.log('[v0] FFmpeg clip complete:', clipResult.id);

    // Upload to Supabase storage (uses service role key internally)
    let clipUrl: string;
    try {
      clipUrl = await uploadClipToStorage(clipResult.filePath, clipResult.id);
      console.log('[v0] Clip uploaded to storage:', clipUrl);
    } catch (uploadError) {
      console.error('[v0] Upload error:', uploadError);
      // Clean up temp file if upload fails
      if (fs.existsSync(clipResult.filePath)) {
        fs.unlinkSync(clipResult.filePath);
      }
      throw uploadError;
    }

    // Store clip metadata in memory
    const storedClip: StoredClip = {
      id: clipResult.id,
      title: title || `Clip ${new Date().toLocaleTimeString()}`,
      url: clipUrl,
      duration: clipResult.duration,
      createdAt: clipResult.createdAt,
      streamUrl,
    };

    clipStore.addClip(storedClip);

    return NextResponse.json({
      success: true,
      clip: storedClip,
    });
  } catch (error) {
    console.error('[v0] Clip creation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[v0] Error stack:', error instanceof Error ? error.stack : 'No stack');

    return NextResponse.json(
      {
        error: 'Failed to create clip',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}