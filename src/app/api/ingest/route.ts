import { NextRequest, NextResponse } from 'next/server';
import { ingestFile, ingestNewFiles } from '@/lib/ingest';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    if (body.file) {
      const result = await ingestFile(body.file);
      return NextResponse.json({ ok: result.ok, message: result.message });
    }

    const inboxPath = body.inboxPath || process.env.INBOX_PATH || './inbox';
    const messages = await ingestNewFiles(inboxPath, false);
    return NextResponse.json({ ok: true, messages });
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const inboxPath = url.searchParams.get('path') || process.env.INBOX_PATH || './inbox';
    const messages = await ingestNewFiles(inboxPath, false);
    return NextResponse.json({ ok: true, messages });
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 });
  }
}
