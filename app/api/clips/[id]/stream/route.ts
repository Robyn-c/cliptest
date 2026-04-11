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

  const candidates = [`${id}.mp4`, `${id}.ts`];

  for (const name of candidates) {
    const { data, error } = await admin.storage
      .from('clips')
      .createSignedUrl(name, 3600);

    if (!error && data?.signedUrl) {
      return NextResponse.redirect(data.signedUrl, { status: 302 });
    }
  }

  return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
}