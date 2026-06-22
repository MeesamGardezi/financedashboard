import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(process.env.DB_PATH || './db/finance.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS screenshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      filename    TEXT NOT NULL,
      filepath    TEXT NOT NULL UNIQUE,
      processed_at TEXT NOT NULL,
      bank_name   TEXT,
      status      TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_name    TEXT NOT NULL,
      account_last4 TEXT,
      account_type TEXT NOT NULL,
      label        TEXT NOT NULL,
      is_active    INTEGER NOT NULL DEFAULT 1,
      UNIQUE(bank_name, account_last4, account_type)
    );

    CREATE TABLE IF NOT EXISTS balances (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id        INTEGER NOT NULL REFERENCES accounts(id),
      screenshot_id     INTEGER NOT NULL REFERENCES screenshots(id),
      snapshot_date     TEXT NOT NULL,
      current_balance   REAL,
      available_balance REAL,
      present_balance   REAL,
      credit_limit      REAL,
      minimum_payment   REAL,
      due_date          TEXT,
      is_over_limit     INTEGER NOT NULL DEFAULT 0,
      raw_text          TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id       INTEGER NOT NULL REFERENCES accounts(id),
      screenshot_id    INTEGER NOT NULL REFERENCES screenshots(id),
      fingerprint      TEXT NOT NULL UNIQUE,
      transaction_date TEXT NOT NULL,
      description      TEXT NOT NULL,
      full_description TEXT,
      amount           REAL NOT NULL,
      is_credit        INTEGER NOT NULL DEFAULT 0,
      is_pending       INTEGER NOT NULL DEFAULT 0,
      transaction_type TEXT,
      running_balance  REAL,
      extracted_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_txn_desc ON transactions(description);
    CREATE INDEX IF NOT EXISTS idx_txn_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_balances_account ON balances(account_id);
    CREATE INDEX IF NOT EXISTS idx_balances_date ON balances(snapshot_date);
  `);
}
