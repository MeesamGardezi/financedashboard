import { NextRequest, NextResponse } from 'next/server';
import { ingestFile, ingestNewFiles } from '@/lib/ingest';

// POST /api/ingest — ingest a single file or all new files in inbox
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    if (body.file) {
      const result = await ingestFile(body.file);
      return NextResponse.json({ ok: result.ok, message: result.message });
    }

    // Ingest all new files in inbox
    const inboxPath = process.env.INBOX_PATH || './inbox';
    // todayOnly=false: the dedicated Bank SS folder is the filter, no date restriction needed
    const messages = await ingestNewFiles(inboxPath, false);
    return NextResponse.json({ ok: true, messages });
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 });
  }
}

// GET /api/ingest — trigger full inbox scan (useful for manual refresh button)
export async function GET() {
  try {
    const inboxPath = process.env.INBOX_PATH || './inbox';
    const messages = await ingestNewFiles(inboxPath, false);
    return NextResponse.json({ ok: true, messages });
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 });
  }
}
