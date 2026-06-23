// OCR-based extraction using Tesseract.js — free, local, no API key required.
// Parses bank screenshots into structured data using regex heuristics.

import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import fs from 'fs';

export interface ExtractedAccount {
  bankName: string;
  accountLast4: string;
  accountType: 'checking' | 'savings' | 'credit_card' | 'loan' | 'line_of_credit' | 'unknown';
  label: string;
  currentBalance: number | null;
  availableBalance: number | null;
  presentBalance: number | null;
  creditLimit: number | null;
  minimumPayment: number | null;
  dueDate: string | null;
  isOverLimit: boolean;
}

export interface ExtractedTransaction {
  date: string;
  description: string;
  fullDescription: string;
  amount: number;
  isCredit: boolean;
  isPending: boolean;
  transactionType: string;
  runningBalance: number | null;
}

export interface ExtractionResult {
  account: ExtractedAccount;
  transactions: ExtractedTransaction[];
  rawText: string;
}

const BANK_PATTERNS: { name: string; patterns: RegExp[] }[] = [
  { name: 'Chase', patterns: [/chase/i, /jpmorgan/i, /j\.p\. morgan/i] },
  { name: 'Bank of America', patterns: [/bank of america/i, /bankofamerica/i, /boa\b/i, /b of a/i] },
  { name: 'TD Bank', patterns: [/\btd bank\b/i, /td business/i, /td premier/i] },
  { name: 'Eastern Bank', patterns: [/eastern bank/i, /eastern savings/i] },
  { name: 'US Bank', patterns: [/u\.s\. bank/i, /us bank/i, /usbank/i] },
];

const ACCOUNT_TYPE_PATTERNS: { type: ExtractedAccount['accountType']; patterns: RegExp[] }[] = [
  { type: 'credit_card', patterns: [/credit card/i, /visa/i, /mastercard/i, /ink /i, /ink\b/i, /cash card/i, /corp card/i] },
  { type: 'loan', patterns: [/\bloan\b/i, /\beidl\b/i, /\bsba\b/i, /lendistry/i, /sblc/i, /credit line/i, /line of credit/i] },
  { type: 'line_of_credit', patterns: [/line of credit/i, /loc\b/i, /credit line/i, /bus credit line/i] },
  { type: 'savings', patterns: [/savings/i, /money market/i, /\bmm\b/i] },
  { type: 'checking', patterns: [/checking/i, /chk\b/i, /business premier/i, /operating/i, /\bchk\b/i] },
];

function parseMoney(text: string): number | null {
  const m = text.match(/\$?([\d,]+\.?\d*)/);
  if (!m) return null;
  const val = parseFloat(m[1].replace(/,/g, ''));
  return isNaN(val) ? null : val;
}

function parseDate(text: string): string | null {
  // MM/DD/YYYY
  let m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  // Month name formats: "Jun 17, 2026" or "Jun 17" or "June 17"
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  };
  m = text.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})?/);
  if (m) {
    const mo = months[m[1].toLowerCase()];
    if (mo) {
      const year = m[3] || new Date().getFullYear().toString();
      return `${year}-${mo}-${m[2].padStart(2, '0')}`;
    }
  }
  return null;
}

function detectBank(text: string): string {
  for (const b of BANK_PATTERNS) {
    if (b.patterns.some(p => p.test(text))) return b.name;
  }
  return 'Unknown';
}

function detectAccountType(text: string): ExtractedAccount['accountType'] {
  for (const t of ACCOUNT_TYPE_PATTERNS) {
    if (t.patterns.some(p => p.test(text))) return t.type;
  }
  return 'checking';
}

function detectAccountLast4(text: string): string {
  const patterns = [
    /\.\.\.([\d]{4})/,
    /…([\d]{4})/,          // ellipsis character
    /x{1,4}([\d]{4})\b/i,
    /ending in ([\d]{4})/i,
    /\*+([\d]{4})/,
    /last 4[:\s]+([\d]{4})/i,
    /[·•\-]([\d]{4})\b/,
    /account[^\d]{0,20}([\d]{4})\b/i,
    /acct[^\d]{0,10}([\d]{4})\b/i,
    // "5604" appearing after account type words in the page title area
    /(?:checking|savings|credit card|card)[^\d]{0,30}([\d]{4})\b/i,
    // Last 4 digits of a sequence like "...1234" anywhere
    /(?<!\d)([\d]{4})(?!\d)(?=\s*$)/m,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return 'XXXX';
}

function parseTransactions(text: string, bankName: string): ExtractedTransaction[] {
  const txns: ExtractedTransaction[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Track current date context for transactions that span multiple lines
  let currentDate = '';
  const today = new Date().toISOString().split('T')[0];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';

    // Try to parse a date from this line
    const dateCandidate = parseDate(line);
    if (dateCandidate) currentDate = dateCandidate;

    // Skip header-like lines and employee card name lines (e.g. "Tom Williamson - 0389")
    if (/^(date|description|amount|balance|type|transaction|debit|credit|posted|pending)$/i.test(line)) continue;
    // Skip employee card holder lines: "Name Name - XXXX" with no dollar amount
    if (/^[A-Z][a-z]+ [A-Z][a-z]+ - \d{4}/.test(line) && !line.includes('$')) continue;

    // Look for amount patterns on this line
    const amountMatches = line.match(/[-−]?\$[\d,]+\.\d{2}/g) || line.match(/[-−]?\d+,\d{3}\.\d{2}/g);
    if (!amountMatches) continue;

    // Last amount on the line is likely the transaction amount (second-to-last if running balance shown)
    const amounts = amountMatches.map(a => {
      const neg = a.startsWith('-') || a.startsWith('−');
      const val = parseMoney(a) || 0;
      return { value: val, isNegative: neg };
    });

    if (amounts.length === 0) continue;

    const isPending = /pending|memo post/i.test(line) ||
      (i > 0 && /pending/i.test(lines[i - 1]));

    // Amount is the first monetary value; running balance is second if present
    const amtRaw = amounts[0];
    const runningBal = amounts.length >= 2 ? amounts[amounts.length - 1].value : null;

    // Get description: remove dates, amounts, bank labels from the line
    let desc = line
      .replace(/\$[\d,]+\.\d{2}/g, '')
      .replace(/[-−]\d+,\d{3}\.\d{2}/g, '')
      .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, '')
      .replace(/[A-Za-z]+ \d{1,2},? \d{4}/g, '')
      .replace(/\b(pending|posted|debit|credit|purchase|payment|ach|transfer)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!desc || desc.length < 3) continue;

    // Determine transaction type
    let txnType = 'other';
    if (/\bach\b/i.test(line)) txnType = /credit/i.test(line) ? 'ACH Credit' : 'ACH Debit';
    else if (/purchase/i.test(line)) txnType = 'Purchase';
    else if (/payment/i.test(line)) txnType = 'Payment';
    else if (/transfer/i.test(line)) txnType = 'Transfer';
    else if (/deposit/i.test(line)) txnType = 'Deposit';
    else if (/fee/i.test(line)) txnType = 'Fee';

    const isCredit = !amtRaw.isNegative && (
      /\+/.test(line) ||
      /deposit|credit|payment received/i.test(desc)
    ) && !/debit/i.test(line);

    const usedDate = currentDate || today;

    // Build full description including any sub-line detail (ORIG ID, TRACE#, etc.)
    let fullDesc = desc;
    if (nextLine && /ORIG|TRACE|IND ID|DESC DATE|SEC:/i.test(nextLine)) {
      fullDesc = desc + '\n' + nextLine;
      i++; // consume the sub-line
    }

    txns.push({
      date: usedDate,
      description: desc.slice(0, 255),
      fullDescription: fullDesc,
      amount: amtRaw.value,
      isCredit,
      isPending,
      transactionType: txnType,
      runningBalance: runningBal,
    });
  }

  return txns;
}

function extractBalances(text: string): {
  current: number | null;
  available: number | null;
  present: number | null;
  creditLimit: number | null;
  minPayment: number | null;
  dueDate: string | null;
  isOverLimit: boolean;
} {
  const result = {
    current: null as number | null,
    available: null as number | null,
    present: null as number | null,
    creditLimit: null as number | null,
    minPayment: null as number | null,
    dueDate: null as string | null,
    isOverLimit: false,
  };

  const lines = text.split('\n').map(l => l.trim());

  // Helper: get money from this line OR the next 1-2 lines (label on one line, value on next)
  function getMoneyNearby(idx: number): number | null {
    const val = parseMoney(lines[idx]);
    if (val !== null) return val;
    // Check next line
    if (idx + 1 < lines.length) {
      const v2 = parseMoney(lines[idx + 1]);
      if (v2 !== null) return v2;
    }
    if (idx + 2 < lines.length) {
      const v3 = parseMoney(lines[idx + 2]);
      if (v3 !== null) return v3;
    }
    return null;
  }

  function getDateNearby(idx: number): string | null {
    const v = parseDate(lines[idx]);
    if (v) return v;
    if (idx + 1 < lines.length) return parseDate(lines[idx + 1]);
    return null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/available balance/i.test(line) || /available:/i.test(line)) {
      result.available = getMoneyNearby(i);
    } else if (/present balance/i.test(line)) {
      const v = getMoneyNearby(i);
      result.present = v;
      if (!result.current) result.current = v;
    } else if (/current balance/i.test(line)) {
      const v = getMoneyNearby(i);
      result.current = v;
      if (!result.present) result.present = v;
    } else if (/\bbalance\b/i.test(line) && !result.current && !result.available) {
      result.current = getMoneyNearby(i);
    } else if (/credit limit/i.test(line) || /total credit line/i.test(line)) {
      result.creditLimit = getMoneyNearby(i);
    } else if (/minimum payment/i.test(line) || /min.*due/i.test(line) || /minimum due/i.test(line)) {
      result.minPayment = getMoneyNearby(i);
    } else if (/payment due/i.test(line) || /due date/i.test(line)) {
      result.dueDate = getDateNearby(i);
    } else if (/over.*limit|over limit|over-limit/i.test(line)) {
      result.isOverLimit = true;
    }
  }

  return result;
}

export async function extractFromImage(imagePath: string): Promise<ExtractionResult | null> {
  // Preprocess image for better OCR: grayscale, sharpen
  const processedPath = imagePath + '_processed.png';
  try {
    await sharp(imagePath)
      .grayscale()
      .sharpen()
      .png()
      .toFile(processedPath);
  } catch {
    // If sharp fails, use original
    fs.copyFileSync(imagePath, processedPath);
  }

  const worker = await createWorker('eng');
  let rawText = '';

  try {
    const { data } = await worker.recognize(processedPath);
    rawText = data.text;
  } finally {
    await worker.terminate();
    try { fs.unlinkSync(processedPath); } catch { /* ignore */ }
  }

  if (!rawText.trim()) return null;

  const bankName = detectBank(rawText);
  const accountLast4 = detectAccountLast4(rawText);
  const accountType = detectAccountType(rawText);

  const balances = extractBalances(rawText);

  // Build label
  const typeLabels: Record<string, string> = {
    checking: 'Checking',
    savings: 'Savings',
    credit_card: 'Credit Card',
    loan: 'Loan',
    line_of_credit: 'Credit Line',
    unknown: 'Account',
  };
  const label = `${bankName} ${typeLabels[accountType] || 'Account'} ...${accountLast4}`;

  const account: ExtractedAccount = {
    bankName,
    accountLast4,
    accountType,
    label,
    currentBalance: balances.current,
    availableBalance: balances.available,
    presentBalance: balances.present,
    creditLimit: balances.creditLimit,
    minimumPayment: balances.minPayment,
    dueDate: balances.dueDate,
    isOverLimit: balances.isOverLimit,
  };

  const transactions = parseTransactions(rawText, bankName);

  return { account, transactions, rawText };
}
