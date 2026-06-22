// Debug endpoint: returns raw OCR text for a given file path so we can tune extraction.
import { NextRequest, NextResponse } from 'next/server';
import { extractFromImage } from '@/lib/extract';

export async function POST(req: NextRequest) {
  const { file } = await req.json();
  if (!file) return NextResponse.json({ error: 'No file path provided' }, { status: 400 });

  try {
    const result = await extractFromImage(file);
    if (!result) return NextResponse.json({ error: 'Could not read image' }, { status: 422 });

    return NextResponse.json({
      rawText: result.rawText,
      account: result.account,
      transactionCount: result.transactions.length,
      transactions: result.transactions.slice(0, 10),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
