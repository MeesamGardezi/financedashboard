'use client';
import type { AccountSummary } from '@/app/api/dashboard/route';

function money(v: number | null, decimals = 0) {
  if (v == null) return '—';
  return '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const BANK_COLORS: Record<string, string> = {
  'Chase': '#1a3d7a',
  'Bank of America': '#b83232',
  'TD Bank': '#1a6b3a',
  'Eastern Bank': '#5a3a9a',
  'US Bank': '#8a1a1a',
};

interface Props {
  accounts: AccountSummary[];
  totalCash: number;
}

export default function KpiStrip({ accounts, totalCash }: Props) {
  const banks = Array.from(new Set(accounts.map(a => a.bankName))).filter(b => b !== 'Unknown');

  const bankTotals = banks.map(bank => {
    const bankAccts = accounts.filter(a =>
      a.bankName === bank && (a.accountType === 'checking' || a.accountType === 'savings')
    );
    const total = bankAccts.reduce((s, a) => s + (a.availableBalance ?? a.currentBalance ?? 0), 0);
    const latest = bankAccts[0]?.snapshotDate || null;
    const isStale = bankAccts.some(a => a.isStale);
    return { bank, total, latest, isStale };
  });

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `1.4fr ${banks.map(() => '1fr').join(' ')}`,
      gap: 12,
      marginBottom: 22,
    }}>
      {/* Total cash KPI */}
      <div style={{
        background: 'var(--ink)',
        border: '1px solid var(--rule)',
        borderRadius: 10,
        padding: '18px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#555,#222)' }} />
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8, color: 'rgba(255,255,255,.6)' }}>
          Total Available Cash
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 30, color: '#fff', letterSpacing: '-.03em', lineHeight: 1 }}>
          {money(totalCash)}
        </div>
        <div style={{ fontSize: 10, marginTop: 6, color: 'rgba(255,255,255,.4)' }}>
          {banks.join(' · ')} · checking &amp; savings
        </div>
      </div>

      {/* Per-bank KPIs */}
      {bankTotals.map(({ bank, total, latest, isStale }) => {
        const color = BANK_COLORS[bank] || '#555';
        const balColor = total < 0 ? 'var(--red)' : isStale ? 'var(--amber)' : 'var(--ink)';
        return (
          <div key={bank} style={{
            background: 'var(--surface)',
            border: '1px solid var(--rule)',
            borderRadius: 10,
            padding: '18px 20px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8, color: 'var(--ink2)' }}>
              {bank}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 24, letterSpacing: '-.03em', lineHeight: 1, color: balColor }}>
              {money(total)}
            </div>
            <div style={{ fontSize: 10, marginTop: 6, color: 'var(--ink4)' }}>
              {latest ? (isStale ? `carried ${latest}` : `as of ${latest}`) : 'no data'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
