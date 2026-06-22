'use client';
import { useEffect, useState, useCallback } from 'react';
import KpiStrip from '@/components/KpiStrip';
import { AccountsPanel, CreditPanel } from '@/components/AccountsPanel';
import TransactionsTable from '@/components/TransactionsTable';
import ChatBox from '@/components/ChatBox';
import type { DashboardData } from '@/app/api/dashboard/route';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  async function scanInbox() {
    setScanning(true);
    setScanMsg([]);
    try {
      const res = await fetch('/api/ingest');
      const json = await res.json();
      setScanMsg(json.messages || [json.message]);
      await load();
    } catch (e) {
      setScanMsg([String(e)]);
    } finally {
      setScanning(false);
    }
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div style={{ padding: '28px 36px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22, paddingBottom: 16, borderBottom: '2px solid var(--ink)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-.01em' }}>
            Financial Dashboard
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>
            Chase · TD Bank · Bank of America · Eastern Bank · US Bank
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={scanInbox}
            disabled={scanning}
            style={{
              padding: '6px 14px',
              background: scanning ? 'var(--rule)' : 'var(--ink)',
              color: scanning ? 'var(--ink4)' : '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: scanning ? 'default' : 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            {scanning ? 'Scanning...' : '⟳ Scan Inbox'}
          </button>
          <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink4)' }}>
            {dateStr} · {timeStr}
            {data?.lastUpdated && (
              <div>last extracted {new Date(data.lastUpdated).toLocaleDateString()}</div>
            )}
          </div>
        </div>
      </div>

      {/* Scan results */}
      {scanMsg.length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: '#edf8f2', border: '1px solid #b0dfc0', borderRadius: 8, fontSize: 12 }}>
          {scanMsg.map((m, i) => <div key={i}>{m}</div>)}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: 'var(--red-bg)', border: '1px solid #e0b0b0', borderRadius: 8, fontSize: 12, color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {!data ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink4)' }}>Loading...</div>
      ) : (
        <>
          <KpiStrip accounts={data.accounts} totalCash={data.totalCash} />

          <div style={{ display: 'grid', gridTemplateColumns: '308px 1fr', gap: 16, alignItems: 'start' }}>
            {/* Left column */}
            <div>
              <AccountsPanel accounts={data.accounts} />
              <CreditPanel accounts={data.accounts} />
              <ChatBox />
            </div>

            {/* Right column */}
            <div>
              <TransactionsTable transactions={data.recentTransactions} />
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 16, fontSize: 10, color: 'var(--ink4)', borderTop: '1px solid var(--rule)', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
            <span>
              {data.accounts.length} accounts · {data.recentTransactions.length} transactions shown
              {data.accounts.filter(a => a.isStale).length > 0 && (
                <span style={{ color: 'var(--amber)', marginLeft: 8 }}>
                  · ⚠ {data.accounts.filter(a => a.isStale).length} account(s) with stale data
                </span>
              )}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>Financial Dashboard · Internal · {dateStr}</span>
          </div>
        </>
      )}
    </div>
  );
}
