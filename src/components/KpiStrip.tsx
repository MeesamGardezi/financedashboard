'use client';
import type { AccountSummary } from '@/app/api/dashboard/route';

function money(v: number | null) {
  if (v == null) return '—';
  return '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const ALL_BANKS = ['Chase', 'TD Bank', 'Bank of America', 'Eastern Bank', 'US Bank'];

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
  lastUpdated: string | null;
}

export default function KpiStrip({ accounts, totalCash, lastUpdated }: Props) {
  const updatedStr = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `1.4fr ${ALL_BANKS.map(() => '1fr').join(' ')}`, gap: 12, marginBottom: 22 }}>
      {/* Total cash */}
      <div style={{ background: 'var(--ink)', borderRadius: 10, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#555,#222)' }} />
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8, color: 'rgba(255,255,255,.6)' }}>
          Total Available Cash
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 30, color: '#fff', letterSpacing: '-.03em', lineHeight: 1 }}>
          {money(totalCash || null)}
        </div>
        <div style={{ fontSize: 10, marginTop: 6, color: 'rgba(255,255,255,.4)' }}>
          {updatedStr ? `last updated ${updatedStr}` : 'no data yet — click Scan Inbox'}
        </div>
      </div>

      {/* One card per bank — always visible */}
      {ALL_BANKS.map(bank => {
        const bankAccts = accounts.filter(a =>
          a.bankName === bank && (a.accountType === 'checking' || a.accountType === 'savings')
        );
        const hasData = bankAccts.length > 0;
        const total = hasData
          ? bankAccts.reduce((s, a) => s + (a.availableBalance ?? a.currentBalance ?? 0), 0)
          : null;
        const snapshotDate = bankAccts[0]?.snapshotDate || null;
        const isStale = hasData && bankAccts.some(a => a.isStale);
        const color = BANK_COLORS[bank] || '#555';
        const valColor = total == null ? 'var(--ink4)' : total < 0 ? 'var(--red)' : isStale ? 'var(--amber)' : 'var(--ink)';

        return (
          <div key={bank} style={{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 10, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8, color: 'var(--ink2)' }}>
              {bank}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 24, letterSpacing: '-.03em', lineHeight: 1, color: valColor }}>
              {money(total)}
            </div>
            <div style={{ fontSize: 10, marginTop: 6, color: isStale ? 'var(--amber)' : 'var(--ink4)' }}>
              {!hasData
                ? 'no screenshot'
                : isStale
                  ? `carried · ${snapshotDate}`
                  : `as of ${snapshotDate}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
