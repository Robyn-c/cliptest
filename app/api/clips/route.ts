import { NextRequest, NextResponse } from 'next/server';
import { clipStore } from '@/lib/clip-store';

/**
 * Get all clips or delete a specific clip
 */
export async function GET(request: NextRequest) {
  try {
    const clips = clipStore.getClips();
    return NextResponse.json({ clips });
  } catch (error) {
    console.error('[v0] Get clips error:', error);
    return NextResponse.json(
      { error: 'Failed to get clips' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clipId = searchParams.get('id');

    if (!clipId) {
      return NextResponse.json(
        { error: 'Clip ID is required' },
        { status: 400 }
      );
    }

    const deleted = clipStore.deleteClip(clipId);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Clip not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Clip deleted',
    });
  } catch (error) {
    console.error('[v0] Delete clip error:', error);
    return NextResponse.json(
      { error: 'Failed to delete clip' },
      { status: 500 }
    );
  }
}
