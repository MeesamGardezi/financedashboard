// Free Q&A: keyword search against the SQLite database — no API key required.
// Interprets the user's question via simple NLP heuristics and returns
// structured results from real data only.

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface ChatResult {
  answer: string;
  rows: Record<string, unknown>[];
  query: string;
}

function fmt(amount: number, isCredit: boolean): string {
  const sign = isCredit ? '+' : '−';
  return `${sign}$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function parseQuestionContext(q: string): {
  vendors: string[];
  dateRange: { start?: string; end?: string; label?: string };
  accountHints: string[];
  intent: string;
} {
  const lower = q.toLowerCase();

  // Intent
  let intent: ChatResult['query'] = 'unknown';
  if (/did we pay|was.*paid|payment.*made/i.test(q)) intent = 'paid';
  else if (/how much.*spend|spent|total.*spend/i.test(q)) intent = 'spent';
  else if (/history|all.*payment|every.*time|recurring/i.test(q)) intent = 'history';
  else if (/balance|how much.*have|current/i.test(q)) intent = 'balance';
  else if (/list|show|what.*transaction|find/i.test(q)) intent = 'list';

  // Date range
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  let dateRange: { start?: string; end?: string; label?: string } = {};

  if (/this month/i.test(q)) {
    dateRange = {
      start: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      label: 'this month',
    };
  } else if (/last month/i.test(q)) {
    const lm = month === 0 ? 12 : month;
    const ly = month === 0 ? year - 1 : year;
    dateRange = {
      start: `${ly}-${String(lm).padStart(2, '0')}-01`,
      end: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      label: 'last month',
    };
  } else if (/this year/i.test(q)) {
    dateRange = { start: `${year}-01-01`, label: `${year}` };
  } else if (/last year/i.test(q)) {
    dateRange = { start: `${year - 1}-01-01`, end: `${year}-01-01`, label: `${year - 1}` };
  } else if (/in (january|february|march|april|may|june|july|august|september|october|november|december)/i.test(q)) {
    const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const m = q.match(/in (january|february|march|april|may|june|july|august|september|october|november|december)/i);
    if (m) {
      const mi = monthNames.indexOf(m[1].toLowerCase());
      const my = mi > month ? year - 1 : year;
      const end = mi === 11 ? `${my + 1}-01-01` : `${my}-${String(mi + 2).padStart(2, '0')}-01`;
      dateRange = {
        start: `${my}-${String(mi + 1).padStart(2, '0')}-01`,
        end,
        label: m[1],
      };
    }
  } else if (/\b(\d{4})\b/.test(q)) {
    const yr = q.match(/\b(\d{4})\b/)![1];
    dateRange = { start: `${yr}-01-01`, end: `${parseInt(yr) + 1}-01-01`, label: yr };
  }

  // Vendor extraction: words in quotes, or words after "to", "from", "for", "AT&T", etc.
  // Capitalised proper nouns after common prepositions
  const vendors: string[] = [];
  const quotedMatch = q.match(/"([^"]+)"/g);
  if (quotedMatch) {
    vendors.push(...quotedMatch.map(s => s.replace(/"/g, '')));
  } else {
    // Extract vendor after keywords
    const prepositions = /(?:pay(?:ment)?(?:s)? (?:to|from|for)|transactions? (?:to|from|for|with)|spend(?:ing)? (?:on|at|to)|charges? (?:from|by)|history of(?: payments? to)?)\s+([A-Za-z0-9&*'.,\s]+?)(?:\s+(?:this|last|in|this|$|\?))/i;
    const pm = q.match(prepositions);
    if (pm) vendors.push(pm[1].trim());
    else {
      // Fallback: capitalised words not in common stop words
      const stopWords = new Set(['did','we','pay','how','much','spend','this','last','month','year','what','the','a','an','is','are','was','were','has','have','show','me','all','payments','transactions','find','history','check','current','balance','account','bank']);
      const words = q.split(/\s+/).filter(w => /^[A-Z]/.test(w) && !stopWords.has(w.toLowerCase()));
      vendors.push(...words);
    }
  }

  // Account hints
  const accountHints: string[] = [];
  if (/chase/i.test(q)) accountHints.push('Chase');
  if (/bank of america|boa\b/i.test(q)) accountHints.push('Bank of America');
  if (/td bank/i.test(q)) accountHints.push('TD Bank');
  if (/eastern/i.test(q)) accountHints.push('Eastern Bank');
  if (/us bank/i.test(q)) accountHints.push('US Bank');

  return { vendors, dateRange, accountHints, intent: intent as any };
}

export async function POST(req: NextRequest) {
  const { question } = await req.json();
  if (!question?.trim()) {
    return NextResponse.json({ answer: 'Please enter a question.', rows: [], query: '' });
  }

  const db = getDb();
  const ctx = parseQuestionContext(question);

  // Balance intent
  if (ctx.intent === 'balance') {
    const rows = db.prepare(`
      SELECT a.label, a.bank_name, a.account_last4, a.account_type,
             b.available_balance, b.current_balance, b.snapshot_date
      FROM accounts a
      LEFT JOIN balances b ON b.id = (
        SELECT id FROM balances WHERE account_id = a.id ORDER BY snapshot_date DESC LIMIT 1
      )
      WHERE a.is_active = 1
      ORDER BY a.bank_name
    `).all() as any[];

    if (rows.length === 0) {
      return NextResponse.json({ answer: 'No account data found in the database yet. Please drop screenshots in the inbox folder first.', rows: [], query: 'account balances' });
    }

    const lines = rows.map(r => {
      const bal = r.available_balance ?? r.current_balance;
      const balStr = bal != null ? `$${bal.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'unknown';
      const stale = r.snapshot_date ? ` (as of ${fmtDate(r.snapshot_date)})` : '';
      return `• ${r.label}: ${balStr}${stale}`;
    });

    return NextResponse.json({
      answer: `Current balances on file:\n\n${lines.join('\n')}`,
      rows,
      query: 'account balances',
    });
  }

  // No vendor — show recent transactions
  if (ctx.vendors.length === 0 && ctx.intent !== 'balance') {
    let sql = `
      SELECT t.transaction_date, a.label as account, t.description, t.amount, t.is_credit, t.is_pending
      FROM transactions t JOIN accounts a ON a.id = t.account_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (ctx.dateRange.start) { sql += ` AND t.transaction_date >= ?`; params.push(ctx.dateRange.start); }
    if (ctx.dateRange.end) { sql += ` AND t.transaction_date < ?`; params.push(ctx.dateRange.end); }
    if (ctx.accountHints.length > 0) {
      sql += ` AND a.bank_name IN (${ctx.accountHints.map(() => '?').join(',')})`;
      params.push(...ctx.accountHints);
    }
    sql += ` ORDER BY t.transaction_date DESC LIMIT 50`;

    const rows = db.prepare(sql).all(...params) as any[];
    if (rows.length === 0) {
      const period = ctx.dateRange.label ? ` for ${ctx.dateRange.label}` : '';
      return NextResponse.json({ answer: `No transactions found in the database${period}. No data found for that date/vendor.`, rows: [], query: sql });
    }

    const lines = rows.map(r =>
      `• ${fmtDate(r.transaction_date)} · ${r.account} · ${r.description} · ${fmt(r.amount, !!r.is_credit)}${r.is_pending ? ' (pending)' : ''}`
    );
    const period = ctx.dateRange.label ? ` for ${ctx.dateRange.label}` : '';
    return NextResponse.json({
      answer: `Found ${rows.length} transactions${period}:\n\n${lines.join('\n')}`,
      rows,
      query: sql,
    });
  }

  // Vendor search
  const results: any[] = [];
  for (const vendor of ctx.vendors) {
    let sql = `
      SELECT t.transaction_date, a.label as account, t.description, t.full_description,
             t.amount, t.is_credit, t.is_pending, t.transaction_type
      FROM transactions t JOIN accounts a ON a.id = t.account_id
      WHERE (LOWER(t.description) LIKE ? OR LOWER(t.full_description) LIKE ?)
    `;
    const like = `%${vendor.toLowerCase()}%`;
    const params: any[] = [like, like];

    if (ctx.dateRange.start) { sql += ` AND t.transaction_date >= ?`; params.push(ctx.dateRange.start); }
    if (ctx.dateRange.end) { sql += ` AND t.transaction_date < ?`; params.push(ctx.dateRange.end); }
    if (ctx.accountHints.length > 0) {
      sql += ` AND a.bank_name IN (${ctx.accountHints.map(() => '?').join(',')})`;
      params.push(...ctx.accountHints);
    }
    sql += ` ORDER BY t.transaction_date DESC LIMIT 100`;

    const rows = db.prepare(sql).all(...params) as any[];
    results.push(...rows);
  }

  if (results.length === 0) {
    const period = ctx.dateRange.label ? ` for ${ctx.dateRange.label}` : '';
    return NextResponse.json({
      answer: `No record found for "${ctx.vendors.join(', ')}"${period}. This vendor does not appear in the database for that period.`,
      rows: [],
      query: `Search for: ${ctx.vendors.join(', ')}`,
    });
  }

  const total = results.reduce((sum, r) => sum + (r.is_credit ? -r.amount : r.amount), 0);
  const period = ctx.dateRange.label ? ` in ${ctx.dateRange.label}` : '';
  const lines = results.map(r =>
    `• ${fmtDate(r.transaction_date)} · ${r.account} · ${r.description} · ${fmt(r.amount, !!r.is_credit)}${r.is_pending ? ' (pending)' : ''}`
  );

  let answer = `Found ${results.length} transaction(s) matching "${ctx.vendors.join(', ')}"${period}:\n\n${lines.join('\n')}`;

  if (ctx.intent === 'spent' || ctx.intent === 'history') {
    answer += `\n\nTotal: $${Math.abs(total).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${total >= 0 ? 'spent' : 'received'}`;
  } else if (ctx.intent === 'paid') {
    const paid = results.filter(r => !r.is_credit);
    answer = paid.length > 0
      ? `Yes — ${paid.length} payment(s) to "${ctx.vendors[0]}"${period}:\n\n${paid.map(r => `• ${fmtDate(r.transaction_date)} · ${fmt(r.amount, false)} · ${r.account}`).join('\n')}`
      : `No record found of payments to "${ctx.vendors[0]}"${period}. No data found for that vendor.`;
  }

  return NextResponse.json({ answer, rows: results, query: `Vendor: ${ctx.vendors.join(', ')}` });
}
