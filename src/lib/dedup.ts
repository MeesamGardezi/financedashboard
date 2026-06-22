import crypto from 'crypto';

export function makeFingerprint(
  bankName: string,
  accountLast4: string,
  date: string,
  description: string,
  amount: number
): string {
  const raw = [
    bankName.toLowerCase().trim(),
    accountLast4.trim(),
    date.trim(),
    description.toLowerCase().trim(),
    amount.toFixed(2),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}
