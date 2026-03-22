import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const admin = getAdmin();

  const { data: files, error } = await admin.storage
    .from('clips')
    .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const clips = (files || [])
    .filter((f) => f.name.endsWith('.mp4') || f.name.endsWith('.ts'))
    .map((f) => {
      const id = f.name.replace(/\.(mp4|ts)$/, '');
      return {
        id,
        title: `Clip ${new Date(f.created_at).toLocaleTimeString()}`,
        url: `/api/clips/${id}/stream`,
        duration: 0, // not stored in Supabase metadata
        createdAt: f.created_at,
      };
    });

  return NextResponse.json({ clips });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const admin = getAdmin();

  // Try both extensions
  for (const ext of ['mp4', 'ts']) {
    const { error } = await admin.storage
      .from('clips')
      .remove([`${id}.${ext}`]);
    if (!error) {
      return NextResponse.json({ success: true });
    }
  }

  return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
}