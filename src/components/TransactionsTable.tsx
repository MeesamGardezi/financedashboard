'use client';
import type { TransactionRow } from '@/app/api/dashboard/route';

function money(amount: number, isCredit: boolean) {
  const sign = isCredit ? '+' : '−';
  const color = isCredit ? 'var(--green)' : 'var(--ink)';
  return <span style={{ color }}>{sign}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>;
}

function fmtDate(d: string) {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const BANK_TAGS: Record<string, { bg: string; color: string }> = {
  'Chase': { bg: '#deeaf8', color: '#1a3d7a' },
  'Bank of America': { bg: '#fde8e8', color: '#7a1a1a' },
  'TD Bank': { bg: '#e0f0e8', color: '#0d5c2e' },
  'Eastern Bank': { bg: '#ede8f8', color: '#3a1a7a' },
  'US Bank': { bg: '#f8e8e8', color: '#6a1a1a' },
};

interface Props {
  transactions: TransactionRow[];
}

type Group = {
  key: string;
  label: string;
  isPending: boolean;
  rows: TransactionRow[];
};

export default function TransactionsTable({ transactions }: Props) {
  if (transactions.length === 0) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 10, padding: '32px 24px', textAlign: 'center', color: 'var(--ink4)' }}>
        <div style={{ fontSize: 14, marginBottom: 8 }}>No transactions yet</div>
        <div style={{ fontSize: 12 }}>Drop bank screenshots in your inbox folder to get started.</div>
      </div>
    );
  }

  // Group by pending/bank/date
  const groups: Group[] = [];
  const seen = new Set<string>();

  for (const txn of transactions) {
    const key = `${txn.isPending ? 'pending' : 'posted'}-${txn.bankName}-${txn.accountLast4}-${txn.date}`;
    if (!seen.has(key)) {
      seen.add(key);
      const label = txn.isPending
        ? `Pending · ${txn.accountLabel} · ${fmtDate(txn.date)}`
        : `${fmtDate(txn.date)} · ${txn.accountLabel} · Posted`;
      groups.push({ key, label, isPending: txn.isPending, rows: [] });
    }
    groups.find(g => g.key === key)!.rows.push(txn);
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#faf9f7' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink2)' }}>Transactions</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink4)' }}>pending first · most recent</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--rule)', background: '#faf9f7' }}>
              {['Date', 'Account', 'Description', 'Type', 'Amount', 'Balance'].map((h, i) => (
                <th key={h} style={{
                  padding: '8px 12px',
                  fontSize: 8, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
                  color: 'var(--ink4)', textAlign: i >= 4 ? 'right' : 'left', whiteSpace: 'nowrap',
                  width: h === 'Date' ? 62 : h === 'Account' ? 100 : h === 'Type' ? 90 : h === 'Amount' ? 96 : h === 'Balance' ? 96 : undefined,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <>
                <tr key={`grp-${group.key}`} style={{
                  background: group.isPending ? '#fffbf2' : '#eeecea',
                  borderTop: '1px solid var(--rule)',
                  borderLeft: group.isPending ? '3px solid #f59e0b' : undefined,
                }}>
                  <td colSpan={6} style={{
                    padding: '5px 12px',
                    fontSize: 9,
                    color: group.isPending ? 'var(--amber)' : 'var(--ink3)',
                    fontWeight: 700,
                  }}>
                    {group.isPending ? '⏳ ' : ''}{group.label}
                  </td>
                </tr>
                {group.rows.map(txn => {
                  const tag = BANK_TAGS[txn.bankName] || { bg: '#eee', color: '#555' };
                  const isWarn = /mca|merchant cash|littlefund|en od capital/i.test(txn.description);
                  return (
                    <tr
                      key={txn.id}
                      style={{
                        borderBottom: '1px solid var(--rule2)',
                        borderLeft: isWarn ? '3px solid var(--amber)' : txn.isCredit ? '3px solid var(--green)' : txn.isPending ? '3px solid #f59e0b' : undefined,
                      }}
                    >
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink4)', whiteSpace: 'nowrap', width: 62 }}>
                        {txn.isPending
                          ? <span style={{ display: 'inline-block', fontSize: 7, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', background: isWarn ? 'var(--amber-bg)' : '#fff3d0', color: isWarn ? 'var(--amber)' : 'var(--amber)', border: '1px solid #e8d090', padding: '2px 6px', borderRadius: 3 }}>
                              {isWarn ? '⚠ Pending' : 'Pending'}
                            </span>
                          : fmtDate(txn.date)
                        }
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 3, whiteSpace: 'nowrap', display: 'inline-block', background: tag.bg, color: tag.color }}>
                          {txn.bankName} ...{txn.accountLast4}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: isWarn ? 'var(--amber)' : txn.isCredit ? 'var(--green)' : 'var(--ink)' }}>
                          {txn.description}
                        </div>
                        {txn.fullDescription && txn.fullDescription !== txn.description && (
                          <div style={{ fontSize: 9, color: 'var(--ink4)', marginTop: 2, fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>
                            {txn.fullDescription.replace(txn.description, '').trim().slice(0, 200)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 10, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                        {txn.transactionType || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {money(txn.amount, txn.isCredit)}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink4)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {txn.runningBalance != null ? `$${txn.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
