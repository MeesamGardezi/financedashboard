import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export interface AccountSummary {
  id: number;
  bankName: string;
  accountLast4: string;
  accountType: string;
  label: string;
  currentBalance: number | null;
  availableBalance: number | null;
  presentBalance: number | null;
  creditLimit: number | null;
  minimumPayment: number | null;
  dueDate: string | null;
  isOverLimit: boolean;
  snapshotDate: string | null;
  isStale: boolean;
}

export interface TransactionRow {
  id: number;
  accountLabel: string;
  bankName: string;
  accountLast4: string;
  date: string;
  description: string;
  fullDescription: string | null;
  amount: number;
  isCredit: boolean;
  isPending: boolean;
  transactionType: string | null;
  runningBalance: number | null;
}

export interface DashboardData {
  accounts: AccountSummary[];
  recentTransactions: TransactionRow[];
  totalCash: number;
  lastUpdated: string | null;
}

export async function GET() {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    // Get latest balance per account
    const accounts = db.prepare(`
      SELECT
        a.id, a.bank_name, a.account_last4, a.account_type, a.label,
        b.current_balance, b.available_balance, b.present_balance,
        b.credit_limit, b.minimum_payment, b.due_date, b.is_over_limit,
        b.snapshot_date
      FROM accounts a
      LEFT JOIN balances b ON b.id = (
        SELECT id FROM balances WHERE account_id = a.id ORDER BY snapshot_date DESC, id DESC LIMIT 1
      )
      WHERE a.is_active = 1
      ORDER BY a.bank_name, a.account_type, a.id
    `).all() as any[];

    const result: AccountSummary[] = accounts.map(a => {
      const daysSince = a.snapshot_date
        ? Math.floor((Date.now() - new Date(a.snapshot_date).getTime()) / 86400000)
        : 999;
      return {
        id: a.id,
        bankName: a.bank_name,
        accountLast4: a.account_last4,
        accountType: a.account_type,
        label: a.label,
        currentBalance: a.current_balance,
        availableBalance: a.available_balance,
        presentBalance: a.present_balance,
        creditLimit: a.credit_limit,
        minimumPayment: a.minimum_payment,
        dueDate: a.due_date,
        isOverLimit: !!a.is_over_limit,
        snapshotDate: a.snapshot_date,
        isStale: daysSince > 1,
      };
    });

    // Total cash = sum of available/current balance for checking + savings only
    const cashAccounts = result.filter(a =>
      a.accountType === 'checking' || a.accountType === 'savings'
    );
    const totalCash = cashAccounts.reduce((sum, a) => {
      const bal = a.availableBalance ?? a.currentBalance ?? 0;
      return sum + (bal > 0 ? bal : 0);
    }, 0);

    // Recent transactions: today + last 2 business days
    const recentTxns = db.prepare(`
      SELECT
        t.id, a.label as account_label, a.bank_name, a.account_last4,
        t.transaction_date as date, t.description, t.full_description,
        t.amount, t.is_credit, t.is_pending, t.transaction_type, t.running_balance
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      ORDER BY t.is_pending DESC, t.transaction_date DESC, t.id DESC
      LIMIT 200
    `).all() as any[];

    const recentTransactions: TransactionRow[] = recentTxns.map(t => ({
      id: t.id,
      accountLabel: t.account_label,
      bankName: t.bank_name,
      accountLast4: t.account_last4,
      date: t.date,
      description: t.description,
      fullDescription: t.full_description,
      amount: t.amount,
      isCredit: !!t.is_credit,
      isPending: !!t.is_pending,
      transactionType: t.transaction_type,
      runningBalance: t.running_balance,
    }));

    const lastUpdated = (db.prepare(
      'SELECT MAX(processed_at) as ts FROM screenshots WHERE status = \'success\''
    ).get() as any)?.ts || null;

    return NextResponse.json({
      accounts: result,
      recentTransactions,
      totalCash,
      lastUpdated,
    } satisfies DashboardData);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
