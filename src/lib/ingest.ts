import path from 'path';
import { getDb } from './db';
import { extractFromImage } from './extract';
import { makeFingerprint } from './dedup';

// Keywords that must appear in OCR text for a screenshot to be considered bank-related.
// If none of these appear, the file is skipped (it's a non-bank screenshot).
const BANK_KEYWORDS = [
  'chase', 'bank of america', 'bankofamerica', 'td bank', 'eastern bank', 'us bank',
  'available balance', 'current balance', 'account balance', 'present balance',
  'checking', 'savings', 'credit card', 'credit limit', 'minimum payment',
  'pending', 'posted', 'transaction', 'deposit', 'withdrawal',
  'routing number', 'account number', 'statement',
  '$', 'balance', 'payment due',
];

function looksLikeBankScreenshot(rawText: string): boolean {
  const lower = rawText.toLowerCase();
  // Must match at least 3 distinct keywords to count as a bank screenshot
  let hits = 0;
  for (const kw of BANK_KEYWORDS) {
    if (lower.includes(kw)) hits++;
    if (hits >= 3) return true;
  }
  return false;
}

export async function ingestFile(filePath: string): Promise<{ ok: boolean; message: string; skipped?: boolean }> {
  const db = getDb();
  const filename = path.basename(filePath);
  const now = new Date().toISOString();

  // Skip if already processed
  const existing = db.prepare('SELECT id FROM screenshots WHERE filepath = ?').get(filePath);
  if (existing) return { ok: true, message: `Already processed: ${filename}` };

  // Insert screenshot record immediately (so duplicate runs skip it)
  const ssResult = db.prepare(`
    INSERT INTO screenshots (filename, filepath, processed_at, status)
    VALUES (?, ?, ?, 'processing')
  `).run(filename, filePath, now);
  const screenshotId = ssResult.lastInsertRowid as number;

  try {
    const result = await extractFromImage(filePath);

    if (!result) {
      db.prepare(`UPDATE screenshots SET status = 'error', bank_name = ? WHERE id = ?`)
        .run('Could not read image', screenshotId);
      return { ok: false, message: `Could not read image: ${filename}` };
    }

    // Check if this looks like a bank screenshot — skip if not
    if (!looksLikeBankScreenshot(result.rawText)) {
      db.prepare(`UPDATE screenshots SET status = 'skipped', bank_name = 'not-bank' WHERE id = ?`)
        .run(screenshotId);
      return { ok: true, skipped: true, message: `Skipped (not a bank screenshot): ${filename}` };
    }

    const { account, transactions } = result;

    // Upsert account
    db.prepare(`
      INSERT INTO accounts (bank_name, account_last4, account_type, label)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(bank_name, account_last4, account_type) DO UPDATE SET label = excluded.label
    `).run(account.bankName, account.accountLast4, account.accountType, account.label);

    const accountRow = db.prepare(`
      SELECT id FROM accounts WHERE bank_name = ? AND account_last4 = ? AND account_type = ?
    `).get(account.bankName, account.accountLast4, account.accountType) as { id: number };

    const accountId = accountRow.id;
    const today = now.split('T')[0];

    // Insert balance snapshot
    db.prepare(`
      INSERT INTO balances (account_id, screenshot_id, snapshot_date, current_balance,
        available_balance, present_balance, credit_limit, minimum_payment, due_date,
        is_over_limit, raw_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      accountId, screenshotId, today,
      account.currentBalance, account.availableBalance, account.presentBalance,
      account.creditLimit, account.minimumPayment, account.dueDate,
      account.isOverLimit ? 1 : 0,
      result.rawText.slice(0, 2000)
    );

    // Insert transactions with dedup
    const txnInsert = db.prepare(`
      INSERT OR IGNORE INTO transactions
        (account_id, screenshot_id, fingerprint, transaction_date, description,
         full_description, amount, is_credit, is_pending, transaction_type,
         running_balance, extracted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let inserted = 0;
    for (const txn of transactions) {
      const fp = makeFingerprint(
        account.bankName, account.accountLast4,
        txn.date, txn.description, txn.amount
      );
      const r = txnInsert.run(
        accountId, screenshotId, fp,
        txn.date, txn.description, txn.fullDescription,
        txn.amount, txn.isCredit ? 1 : 0, txn.isPending ? 1 : 0,
        txn.transactionType, txn.runningBalance, now
      );
      if (r.changes > 0) inserted++;
    }

    db.prepare(`UPDATE screenshots SET status = 'success', bank_name = ? WHERE id = ?`)
      .run(account.bankName, screenshotId);

    return {
      ok: true,
      message: `✓ ${filename}: ${account.bankName} ...${account.accountLast4} — ${inserted} new transactions`,
    };
  } catch (err) {
    db.prepare(`UPDATE screenshots SET status = 'error' WHERE id = ?`).run(screenshotId);
    return { ok: false, message: `Error processing ${filename}: ${String(err)}` };
  }
}

export async function ingestNewFiles(inboxPath: string, todayOnly = true): Promise<string[]> {
  const fs = await import('fs');
  const path = await import('path');

  if (!fs.existsSync(inboxPath)) {
    return [`Inbox folder not found: ${inboxPath}`];
  }

  const db = getDb();
  const processed = new Set(
    (db.prepare('SELECT filepath FROM screenshots').all() as { filepath: string }[]).map(r => r.filepath)
  );

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const files = fs.readdirSync(inboxPath)
    .filter(f => /\.(png|jpg|jpeg|webp|bmp|tiff?)$/i.test(f))
    .map(f => {
      const fp = path.join(inboxPath, f);
      const stat = fs.statSync(fp);
      return { fp, mtime: stat.mtime };
    })
    .filter(({ fp, mtime }) => {
      if (processed.has(fp)) return false;
      // Only process files modified/created today
      if (todayOnly && mtime < todayStart) return false;
      return true;
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()) // newest first
    .map(({ fp }) => fp);

  if (files.length === 0) {
    return todayOnly
      ? [`No new screenshots from today found in: ${inboxPath}`]
      : ['No new files to process'];
  }

  const results: string[] = [];
  let bankCount = 0;
  let skipCount = 0;

  for (const fp of files) {
    const r = await ingestFile(fp);
    if (r.skipped) skipCount++;
    else if (r.ok) bankCount++;
    results.push(r.message);
  }

  results.push(`— ${bankCount} bank screenshot(s) processed, ${skipCount} non-bank file(s) skipped`);
  return results;
}
