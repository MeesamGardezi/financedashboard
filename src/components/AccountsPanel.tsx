'use client';
import type { AccountSummary } from '@/app/api/dashboard/route';

function money(v: number | null) {
  if (v == null) return '—';
  return '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2 });
}

const TYPE_LABELS: Record<string, string> = {
  checking: 'CHK', savings: 'SAV', credit_card: 'CC',
  loan: 'LOAN', line_of_credit: 'LOC', unknown: '?',
};

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  checking: { bg: '#eef2fa', color: '#1a3d7a' },
  savings: { bg: '#edf8f2', color: '#0d5c2e' },
  credit_card: { bg: '#fdf0f0', color: '#7a2020' },
  loan: { bg: '#f0eef8', color: '#3a1a7a' },
  line_of_credit: { bg: '#f0eef8', color: '#3a1a7a' },
  unknown: { bg: '#f0ede8', color: '#8a8680' },
};

interface Props {
  accounts: AccountSummary[];
}

export function AccountsPanel({ accounts }: Props) {
  const cashAccounts = accounts.filter(a => a.accountType === 'checking' || a.accountType === 'savings');
  const total = cashAccounts.reduce((s, a) => s + (a.availableBalance ?? a.currentBalance ?? 0), 0);

  return (
    <Panel title="Bank Accounts" meta="Available balance">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {cashAccounts.map(a => {
            const bal = a.availableBalance ?? a.currentBalance;
            const balColor = bal == null ? 'var(--ink4)' : bal < 0 ? 'var(--red)' : bal === 0 ? 'var(--ink4)' : a.isStale ? 'var(--amber)' : 'var(--ink)';
            const tc = TYPE_COLORS[a.accountType] || TYPE_COLORS.unknown;
            return (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--rule2)' }}>
                <td style={{ padding: '9px 18px', verticalAlign: 'middle' }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>
                    {a.label.replace(/ \.\.\.[A-Z0-9]+$/, '')}
                    <span style={{ display: 'inline-block', fontSize: 7, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', padding: '1px 5px', borderRadius: 3, marginLeft: 4, verticalAlign: 'middle', background: tc.bg, color: tc.color }}>
                      {TYPE_LABELS[a.accountType] || '?'}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink4)', marginTop: 1 }}>
                    ...{a.accountLast4} · {a.snapshotDate ? (a.isStale ? `carried ${a.snapshotDate}` : `live ${a.snapshotDate}`) : 'no data'}
                  </div>
                </td>
                <td style={{ padding: '9px 18px', textAlign: 'right', verticalAlign: 'middle' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500, color: balColor, whiteSpace: 'nowrap' }}>
                    {bal != null ? money(bal) : '—'}
                  </div>
                  {a.isStale && <div style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 600, marginTop: 2 }}>stale</div>}
                  {a.isOverLimit && <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600, marginTop: 2 }}>OVER LIMIT</div>}
                </td>
              </tr>
            );
          })}
          <tr style={{ background: '#f7f5f2' }}>
            <td style={{ padding: '10px 18px', fontWeight: 700, fontSize: 12 }}>Total All Banks</td>
            <td style={{ padding: '10px 18px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700 }}>{money(total)}</td>
          </tr>
        </tbody>
      </table>
    </Panel>
  );
}

export function CreditPanel({ accounts }: Props) {
  const creditAccounts = accounts.filter(a =>
    a.accountType === 'credit_card' || a.accountType === 'loan' || a.accountType === 'line_of_credit'
  );
  if (creditAccounts.length === 0) return null;

  return (
    <Panel title="Credit Cards & Loans" meta="Balance · Available · Due dates">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {creditAccounts.map(a => {
            const bal = a.currentBalance;
            const avail = a.availableBalance;
            const tc = TYPE_COLORS[a.accountType] || TYPE_COLORS.unknown;
            const balColor = a.isOverLimit ? 'var(--red)' : bal && bal > 100000 ? 'var(--red)' : 'var(--ink)';
            const utilPct = a.creditLimit && bal ? Math.min((bal / a.creditLimit) * 100, 100) : null;

            return (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--rule2)' }}>
                <td style={{ padding: '9px 18px', verticalAlign: 'middle' }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>
                    {a.label.replace(/ \.\.\.[A-Z0-9]+$/, '')}
                    <span style={{ display: 'inline-block', fontSize: 7, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', padding: '1px 5px', borderRadius: 3, marginLeft: 4, verticalAlign: 'middle', background: tc.bg, color: tc.color }}>
                      {TYPE_LABELS[a.accountType] || '?'}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink4)', marginTop: 1 }}>
                    ...{a.accountLast4} · {a.snapshotDate || 'no data'}
                  </div>
                  {a.minimumPayment != null && (
                    <div style={{ fontSize: 9, color: a.dueDate ? 'var(--amber)' : 'var(--ink4)', marginTop: 2 }}>
                      Min ${a.minimumPayment.toLocaleString()} due {a.dueDate || '?'}
                    </div>
                  )}
                  {utilPct != null && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ height: 5, background: 'var(--rule)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${utilPct}%`, background: utilPct > 90 ? 'var(--red)' : utilPct > 70 ? 'var(--amber)' : 'var(--green)', borderRadius: 3 }} />
                      </div>
                    </div>
                  )}
                </td>
                <td style={{ padding: '9px 18px', textAlign: 'right', verticalAlign: 'middle' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500, color: balColor, whiteSpace: 'nowrap' }}>
                    {bal != null ? money(bal) : '—'}
                  </div>
                  {avail != null && (
                    <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600, marginTop: 2 }}>
                      {money(avail)} available
                    </div>
                  )}
                  {a.isOverLimit && (
                    <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600, marginTop: 2 }}>OVER LIMIT</div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function Panel({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#faf9f7' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink2)' }}>{title}</span>
        {meta && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink4)' }}>{meta}</span>}
      </div>
      {children}
    </div>
  );
}
