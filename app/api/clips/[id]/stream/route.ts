import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: files } = await admin.storage
    .from('clips')
    .list('', { limit: 1000 });

  const match = files?.find(
    (f) => f.name === `${id}.mp4` || f.name === `${id}.ts`
  );

  if (!match) {
    return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  }

  const { data, error } = await admin.storage
    .from('clips')
    .download(match.name);

  if (error || !data) {
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }

  const isTs = match.name.endsWith('.ts');
  const contentType = isTs ? 'video/mp2t' : 'video/mp4';

  return new NextResponse(data, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
      'Accept-Ranges': 'bytes',
    },
  });
}