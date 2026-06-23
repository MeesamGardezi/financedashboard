import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST() {
  const db = getDb();
  db.pragma('foreign_keys = OFF');
  db.prepare('DELETE FROM transactions').run();
  db.prepare('DELETE FROM balances').run();
  db.prepare('DELETE FROM screenshots').run();
  db.prepare('DELETE FROM accounts').run();
  db.pragma('foreign_keys = ON');
  return NextResponse.json({ ok: true, message: 'Database cleared — click Scan Inbox to re-process all screenshots' });
}
