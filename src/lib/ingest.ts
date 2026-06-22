import path from 'path';
import { getDb } from './db';
import { extractFromImage } from './extract';
import { makeFingerprint } from './dedup';

export async function ingestFile(filePath: string): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const filename = path.basename(filePath);
  const now = new Date().toISOString();

  // Skip if already processed
  const existing = db.prepare('SELECT id FROM screenshots WHERE filepath = ?').get(filePath);
  if (existing) return { ok: true, message: `Already processed: ${filename}` };

  // Insert screenshot record immediately (so duplicate runs skip it)
  const ssInsert = db.prepare(`
    INSERT INTO screenshots (filename, filepath, processed_at, status)
    VALUES (?, ?, ?, 'processing')
  `);
  const ssResult = ssInsert.run(filename, filePath, now);
  const screenshotId = ssResult.lastInsertRowid as number;

  try {
    const result = await extractFromImage(filePath);

    if (!result) {
      db.prepare(`UPDATE screenshots SET status = 'error', bank_name = ? WHERE id = ?`)
        .run('Could not read image', screenshotId);
      return { ok: false, message: `Could not read image: ${filename}` };
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
      message: `${filename}: ${account.bankName} ...${account.accountLast4} — ${inserted} new transactions`,
    };
  } catch (err) {
    db.prepare(`UPDATE screenshots SET status = 'error' WHERE id = ?`).run(screenshotId);
    return { ok: false, message: `Error processing ${filename}: ${String(err)}` };
  }
}

export async function ingestNewFiles(inboxPath: string): Promise<string[]> {
  const fs = await import('fs');
  const path = await import('path');

  if (!fs.existsSync(inboxPath)) {
    return [`Inbox folder not found: ${inboxPath}`];
  }

  const db = getDb();
  const processed = new Set(
    (db.prepare('SELECT filepath FROM screenshots').all() as { filepath: string }[]).map(r => r.filepath)
  );

  const files = fs.readdirSync(inboxPath)
    .filter(f => /\.(png|jpg|jpeg|webp|bmp|tiff?)$/i.test(f))
    .map(f => path.join(inboxPath, f))
    .filter(fp => !processed.has(fp));

  if (files.length === 0) return ['No new files to process'];

  const results: string[] = [];
  for (const fp of files) {
    const r = await ingestFile(fp);
    results.push(r.message);
  }
  return results;
}
