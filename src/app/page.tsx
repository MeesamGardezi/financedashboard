'use client';
import { useEffect, useState, useCallback } from 'react';
import type { DashboardData, AccountSummary, TransactionRow } from '@/app/api/dashboard/route';

const DEFAULT_INBOX = "J:\\.shortcut-targets-by-id\\1HRgCQ5gOjpeGaUjgaq3OF5a-NWIDo7AK\\Common Folder\\today\\Bank SS";

function fmt(v: number | null, decimals = 0) {
  if (v == null) return '—';
  return '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtFull(v: number | null) { return fmt(v, 2); }
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function bankAccts(accounts: AccountSummary[], bank: string, types: string[]) {
  return accounts.filter(a => a.bankName === bank && types.includes(a.accountType));
}
function bankTotal(accounts: AccountSummary[], bank: string) {
  return bankAccts(accounts, bank, ['checking', 'savings'])
    .reduce((s, a) => s + (a.availableBalance ?? a.currentBalance ?? 0), 0);
}
function badgeClass(type: string) {
  return type === 'savings' ? 'bs' : type === 'credit_card' ? 'bcc' : type === 'loan' || type === 'line_of_credit' ? 'bl' : 'bc';
}
function badgeLabel(type: string) {
  return type === 'savings' ? 'SAV' : type === 'credit_card' ? 'CC' : type === 'loan' ? 'LOAN' : type === 'line_of_credit' ? 'LOC' : 'CHK';
}
function bankTag(bank: string) {
  if (bank === 'Chase') return 'tch';
  if (bank === 'Bank of America') return 'tbo';
  if (bank === 'TD Bank') return 'ttd';
  if (bank === 'US Bank') return 'tus';
  return 'tea';
}
function bankShort(bank: string, last4: string) {
  if (bank === 'Chase') return `Chase ...${last4}`;
  if (bank === 'Bank of America') return `BoA ...${last4}`;
  if (bank === 'TD Bank') return `TD ...${last4}`;
  if (bank === 'US Bank') return `US Bank ...${last4}`;
  if (bank === 'Eastern Bank') return `Eastern ...${last4}`;
  return `${bank} ...${last4}`;
}

function KpiCard({ label, value, sub, cls, colorClass }: { label: string; value: string; sub: string; cls: string; colorClass: string }) {
  return (
    <div className={`kpi ${cls}`}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${colorClass}`}>{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string[]>([]);
  const [inboxPath, setInboxPath] = useState(DEFAULT_INBOX);
  const [showFolder, setShowFolder] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) setData(await res.json());
    } catch {}
  }, []);

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);

  async function scanInbox() {
    setScanning(true); setScanMsg([]);
    try {
      const res = await fetch('/api/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inboxPath }) });
      const json = await res.json();
      setScanMsg(json.messages || [json.message]);
      await load();
    } catch (e) { setScanMsg([String(e)]); }
    finally { setScanning(false); }
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const accounts = data?.accounts || [];
  const transactions = data?.recentTransactions || [];
  const lastUpd = data?.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  // KPI totals
  const totalCash = data?.totalCash ?? 0;
  const chaseTotal = bankTotal(accounts, 'Chase');
  const tdTotal = bankTotal(accounts, 'TD Bank');
  const boaTotal = bankTotal(accounts, 'Bank of America');
  const easternTotal = bankTotal(accounts, 'Eastern Bank');
  const usTotal = bankTotal(accounts, 'US Bank');

  const chaseAccts = bankAccts(accounts, 'Chase', ['checking', 'savings']);
  const tdAccts = bankAccts(accounts, 'TD Bank', ['checking', 'savings']);
  const boaChkAccts = bankAccts(accounts, 'Bank of America', ['checking', 'savings']);
  const easternAccts = bankAccts(accounts, 'Eastern Bank', ['checking', 'savings']);
  const usAccts = bankAccts(accounts, 'US Bank', ['checking', 'savings']);
  const cashAccounts = accounts.filter(a => a.accountType === 'checking' || a.accountType === 'savings');
  const creditAccounts = accounts.filter(a => ['credit_card', 'loan', 'line_of_credit'].includes(a.accountType));

  const hasChase = chaseAccts.length > 0;
  const hasTd = tdAccts.length > 0;
  const hasBoa = boaChkAccts.length > 0 || accounts.some(a => a.bankName === 'Bank of America');
  const hasEastern = easternAccts.length > 0;
  const hasUs = usAccts.length > 0 || accounts.some(a => a.bankName === 'US Bank');

  // Group transactions
  const pending = transactions.filter(t => t.isPending);
  const posted = transactions.filter(t => !t.isPending);

  // Group posted by bank+date
  type Group = { key: string; bank: string; date: string; rows: TransactionRow[] };
  const groups: Group[] = [];
  if (pending.length > 0) {
    const byAcct: Record<string, TransactionRow[]> = {};
    pending.forEach(t => { const k = `${t.bankName}|${t.accountLast4}`; (byAcct[k] = byAcct[k] || []).push(t); });
    Object.entries(byAcct).forEach(([k, rows]) => {
      const [bank, last4] = k.split('|');
      groups.push({ key: 'p|' + k, bank, date: rows[0].date, rows });
    });
  }
  const postedByGroup: Record<string, TransactionRow[]> = {};
  posted.forEach(t => { const k = `${t.date}|${t.bankName}|${t.accountLast4}`; (postedByGroup[k] = postedByGroup[k] || []).push(t); });
  Object.entries(postedByGroup).forEach(([k, rows]) => {
    const [date, bank, last4] = k.split('|');
    groups.push({ key: k, bank, date, rows });
  });

  return (
    <>
      <div className="page-hdr">
        <div>
          <div className="page-title">Financial Dashboard</div>
          <div className="page-co">Chase · TD Bank · Bank of America · Eastern Bank · US Bank</div>
        </div>
        <div className="page-meta">
          {dateStr} · {timeStr}<br />
          {lastUpd && <span className="good-hdr">Last scan: {lastUpd}</span>}
          <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowFolder(s => !s)} style={{ padding: '5px 10px', background: 'var(--rule)', color: 'var(--ink2)', border: '1px solid var(--rule)', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}>⚙ Folder</button>
            <button onClick={async () => { if (confirm('Clear all data and rescan?')) { await fetch('/api/reset', { method: 'POST' }); await load(); scanInbox(); } }} style={{ padding: '5px 10px', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #e0b0b0', borderRadius: 5, fontSize: 10, cursor: 'pointer' }}>↺ Reset</button>
            <button onClick={scanInbox} disabled={scanning} style={{ padding: '5px 12px', background: scanning ? 'var(--rule)' : 'var(--ink)', color: scanning ? 'var(--ink4)' : '#fff', border: 'none', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: scanning ? 'default' : 'pointer' }}>
              {scanning ? 'Scanning…' : '⟳ Scan Inbox'}
            </button>
          </div>
        </div>
      </div>

      {showFolder && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>Bank SS folder:</span>
          <input value={inboxPath} onChange={e => setInboxPath(e.target.value)} style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--rule)', borderRadius: 4, fontSize: 11, fontFamily: 'var(--font-mono)', background: '#faf9f7' }} />
          <button onClick={() => { setShowFolder(false); scanInbox(); }} style={{ padding: '4px 12px', background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Scan</button>
        </div>
      )}

      {scanMsg.length > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#edf8f2', border: '1px solid #b0dfc0', borderRadius: 8, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          {scanMsg.map((m, i) => <div key={i}>{m}</div>)}
        </div>
      )}

      {/* KPI STRIP */}
      <div className="kpi-strip">
        <div className="kpi kpi-total">
          <div className="kpi-label">Total Available Cash</div>
          <div className={`kpi-value ${totalCash > 0 ? 'grn' : ''}`}>{totalCash > 0 ? fmt(totalCash) : '—'}</div>
          <div className="kpi-sub">{lastUpd ? `last updated ${lastUpd}` : 'drop bank screenshots in inbox · click Scan Inbox'}</div>
        </div>
        <div className="kpi kpi-chase">
          <div className="kpi-label">Chase{hasChase && chaseAccts.length > 1 ? ` (${chaseAccts.length} Accts)` : ''}</div>
          <div className={`kpi-value ${!hasChase ? 'muted' : chaseTotal > 0 ? 'grn' : 'amb'}`}>{hasChase ? fmt(chaseTotal) : '—'}</div>
          <div className="kpi-sub">{hasChase ? chaseAccts.map(a => `...${a.accountLast4} ${fmtFull(a.availableBalance ?? a.currentBalance)}`).join(' · ') : 'no screenshot'}</div>
        </div>
        <div className="kpi kpi-boa">
          <div className="kpi-label">Bank of America</div>
          <div className={`kpi-value ${!hasBoa ? 'muted' : boaTotal > 0 ? '' : 'red'}`}>{hasBoa ? fmt(boaTotal) : '—'}</div>
          <div className="kpi-sub">
            {!hasBoa ? 'no screenshot' : (() => {
              const cc = accounts.filter(a => a.bankName === 'Bank of America' && a.accountType === 'credit_card');
              const parts: string[] = [];
              boaChkAccts.forEach(a => parts.push(`Chk ${fmtFull(a.availableBalance ?? a.currentBalance)}`));
              cc.forEach(a => { if (a.isOverLimit) parts.push(`CC OVER LIMIT`); else parts.push(`CC avail ${fmtFull(a.availableBalance)}`); });
              return parts.join(' · ') || 'no data';
            })()}
          </div>
        </div>
        <div className="kpi kpi-td">
          <div className="kpi-label">TD Bank</div>
          <div className={`kpi-value ${!hasTd ? 'muted' : tdTotal < 500 && tdTotal > 0 ? 'amb' : tdTotal > 0 ? '' : 'muted'}`}>{hasTd ? fmt(tdTotal) : '—'}</div>
          <div className="kpi-sub">{hasTd ? tdAccts.map(a => `...${a.accountLast4} · ${a.isStale ? `carried ${a.snapshotDate}` : `live ${a.snapshotDate}`}`).join(' · ') : 'no screenshot'}</div>
        </div>
        <div className="kpi kpi-eastern">
          <div className="kpi-label">Eastern Bank</div>
          <div className={`kpi-value ${!hasEastern ? 'muted' : easternTotal > 0 ? '' : 'muted'}`}>{hasEastern ? fmt(easternTotal) : '—'}</div>
          <div className="kpi-sub">{hasEastern ? easternAccts.map(a => `${a.accountType === 'savings' ? 'MM' : 'Op'} ${fmtFull(a.availableBalance ?? a.currentBalance)}`).join(' · ') : 'no screenshot'}</div>
        </div>
        <div className="kpi kpi-us">
          <div className="kpi-label">US Bank</div>
          <div className={`kpi-value ${!hasUs ? 'muted' : usTotal > 0 ? '' : 'muted'}`}>{hasUs ? fmt(usTotal) : '—'}</div>
          <div className="kpi-sub">{hasUs ? usAccts.map(a => `...${a.accountLast4}`).join(' · ') : 'no screenshot'}</div>
        </div>
      </div>

      {/* TWO-COLUMN LAYOUT */}
      <div className="cols">
        {/* LEFT */}
        <div>
          {/* BANK ACCOUNTS */}
          <div className="panel">
            <div className="ph">
              <span className="ph-t">Bank Accounts</span>
              <span className="ph-m">Available balance</span>
            </div>
            <table className="at"><tbody>
              {cashAccounts.length === 0 ? (
                <tr><td colSpan={2} style={{ padding: '18px', color: 'var(--ink4)', fontSize: 12, textAlign: 'center' }}>No data · click Scan Inbox</td></tr>
              ) : cashAccounts.map(a => {
                const bal = a.availableBalance ?? a.currentBalance;
                const balCls = bal == null ? 'zero' : bal < 0 ? 'red' : bal === 0 ? 'zero' : a.isStale ? 'amb' : 'ok';
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="an">{a.label.replace(/ \.\.\.[A-Z0-9]+$/i, '')} <span className={`badge ${badgeClass(a.accountType)}`}>{badgeLabel(a.accountType)}</span></div>
                      <div className="ai">...{a.accountLast4} · {a.snapshotDate ? (a.isStale ? `carried ${a.snapshotDate}` : `live ${a.snapshotDate}`) : 'no data'}</div>
                      {a.isOverLimit && <div className="ak al">⚠ OVER LIMIT</div>}
                    </td>
                    <td><div className={`ab ${balCls}`}>{fmtFull(bal)}</div></td>
                  </tr>
                );
              })}
              {cashAccounts.length > 0 && (
                <tr className="tot">
                  <td><div className="an">Total All Banks</div></td>
                  <td><div className={`ab ${totalCash > 0 ? 'grn' : 'zero'}`}>{fmtFull(totalCash)}</div></td>
                </tr>
              )}
            </tbody></table>
          </div>

          {/* CREDIT CARDS & LOANS */}
          {creditAccounts.length > 0 && (
            <div className="panel">
              <div className="ph">
                <span className="ph-t">Credit Cards &amp; Loans</span>
                <span className="ph-m">Balance · Available · Due dates</span>
              </div>
              <table className="at"><tbody>
                {creditAccounts.map(a => {
                  const bal = a.currentBalance;
                  const avail = a.availableBalance;
                  const utilPct = a.creditLimit && bal ? Math.min((bal / a.creditLimit) * 100, 100) : null;
                  const balCls = a.isOverLimit ? 'red' : 'ok';
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="an">{a.label.replace(/ \.\.\.[A-Z0-9]+$/i, '')} <span className={`badge ${badgeClass(a.accountType)}`}>{badgeLabel(a.accountType)}</span></div>
                        <div className="ai">...{a.accountLast4} · {a.snapshotDate || 'no data'}</div>
                        {a.minimumPayment != null && <div className={`ak ${a.dueDate ? 'aw2' : ''}`}>Min {fmtFull(a.minimumPayment)} due {a.dueDate || '?'}</div>}
                        {a.isOverLimit && <div className="ak al">⚠ OVER LIMIT</div>}
                        {utilPct != null && (
                          <div className="util-wrap">
                            <div className="util-track"><div className="util-fill" style={{ width: `${utilPct}%`, background: utilPct > 90 ? 'var(--red)' : utilPct > 70 ? 'var(--amber)' : 'var(--green)' }} /></div>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className={`ab ${balCls}`}>{fmtFull(bal)}</div>
                        {avail != null && <div className="ag">{fmtFull(avail)} available</div>}
                        {a.isOverLimit && <div className="aw">OVER LIMIT — consider payment</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody></table>
            </div>
          )}

          {/* Q&A */}
          <QA />
        </div>

        {/* RIGHT — TRANSACTIONS */}
        <div>
          <div className="panel">
            <div className="ph">
              <span className="ph-t">Transactions</span>
              <span className="ph-m">pending first · most recent</span>
            </div>
            <div className="tx-wrap">
              <table className="txt">
                <thead>
                  <tr>
                    <th style={{ width: 62 }}>Date</th>
                    <th style={{ width: 88 }}>Account</th>
                    <th>Description</th>
                    <th style={{ width: 100 }}>Type</th>
                    <th className="r" style={{ width: 96 }}>Amount</th>
                    <th className="r" style={{ width: 96 }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--ink4)' }}>No transactions yet · click Scan Inbox to get started</td></tr>
                  ) : groups.map(g => {
                    const isPending = g.key.startsWith('p|');
                    const grpCls = isPending ? 'grp p' : 'grp good';
                    const label = isPending
                      ? `⏳ Pending · ${bankShort(g.bank, g.rows[0].accountLast4)} · ${fmtDate(g.date)}`
                      : `${fmtDate(g.date)} · ${bankShort(g.bank, g.rows[0].accountLast4)} · Posted`;
                    return [
                      <tr key={g.key + '-hdr'} className={grpCls}><td colSpan={6}><strong>{label}</strong></td></tr>,
                      ...g.rows.map((t, i) => {
                        const isMca = /mca|kng|littefund|en od|equities/i.test(t.description);
                        const rowCls = isPending ? 'pnd' + (t.isCredit ? ' crd-row' : isMca ? ' warn-row' : '') : t.isCredit ? 'crd-row' : isMca ? 'warn-row' : '';
                        const amtCls = t.isCredit ? 'cr' : isMca ? 'am' : 'db';
                        const descCls = t.isCredit ? 'good' : isMca ? 'warn' : '';
                        const tag = bankTag(t.bankName);
                        return (
                          <tr key={t.id} className={rowCls}>
                            <td className="tdt">
                              {isPending
                                ? (t.isCredit ? <span className="pg">💰 Pending</span> : isMca ? <span className="pa">⚠ Pending</span> : <span className="pb">Pending</span>)
                                : fmtDate(t.date)}
                            </td>
                            <td><span className={`btag ${tag}`}>{bankShort(t.bankName, t.accountLast4)}</span></td>
                            <td>
                              <div className={`tdd ${descCls}`}>{t.description}</div>
                              {t.fullDescription && t.fullDescription !== t.description && <div className="tds">{t.fullDescription}</div>}
                            </td>
                            <td className="tdt2">{t.transactionType || 'Other'}</td>
                            <td className={`tda ${amtCls}`}>{t.isCredit ? '+' : '−'}{fmtFull(t.amount)}</td>
                            <td className="tdb">{t.runningBalance != null ? fmtFull(t.runningBalance) : '—'}</td>
                          </tr>
                        );
                      })
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="footer">
        <span>
          {cashAccounts.map(a => `${a.label} ${fmtFull(a.availableBalance ?? a.currentBalance)}${a.isStale ? ` carried ${a.snapshotDate}` : ''}`).join(' · ')}
          {lastUpd && ` · last scan ${lastUpd}`}
        </span>
        <span>Financial Dashboard · Internal · {dateStr}</span>
      </div>
    </>
  );
}

function QA() {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) });
      const j = await res.json();
      setAnswer(j.answer || '');
    } catch { setAnswer('Error contacting server.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="panel">
      <div className="ph">
        <span className="ph-t">Transaction Q&amp;A</span>
        <span className="ph-m">searches real data only · free</span>
      </div>
      <div style={{ padding: '12px 16px' }}>
        {!answer && (
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 10 }}>
            <div style={{ marginBottom: 6 }}>Ask me anything about your transactions.</div>
            <div style={{ fontSize: 10, color: 'var(--ink4)', lineHeight: 1.8 }}>
              • "Did we pay AT&amp;T this month?"<br />
              • "How much did we spend on Champion Energy?"<br />
              • "What are my current balances?"
            </div>
          </div>
        )}
        {answer && <div style={{ fontSize: 11, whiteSpace: 'pre-wrap', marginBottom: 10, padding: '8px 10px', background: 'var(--bg)', borderRadius: 6, lineHeight: 1.7 }}>{answer}</div>}
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder="Ask about your transactions..." style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--rule)', borderRadius: 5, fontSize: 11, fontFamily: 'var(--font-body)', background: 'var(--bg)' }} />
          <button onClick={ask} disabled={loading || !q.trim()} style={{ padding: '6px 14px', background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1 }}>Ask</button>
        </div>
      </div>
    </div>
  );
}
