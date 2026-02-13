import { parseUnits } from 'viem';

export const MAX_USDC_MINOR = 1_000_000_000_000_000 - 1; // 1 quadrillion - 1 (minor units)
export const MIN_WITHDRAW_RECEIVE_MINOR = 1_000_000; // 1.00 USDC

export function toNumberSafe(value: bigint | null): number {
  if (value === null) return 0;
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return 0;
  return asNumber;
}

export function normalizeTimestamp(value?: number): number | null {
  if (!value) return null;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

export function formatUsdc(minorUnits?: number | null): string {
  if (minorUnits === null || minorUnits === undefined) return '0.00';
  return (minorUnits / 1_000_000).toFixed(2);
}

export function timeRemainingLabel(expiresAtMs?: number | null, nowMs = Date.now()): string {
  if (!expiresAtMs) return '';
  const diff = expiresAtMs - nowMs;
  if (diff <= 0) return 'Expired';
  const seconds = Math.max(1, Math.floor(diff / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m`;
}

export function isQuoteExpiredError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('quote') &&
    (normalized.includes('expired') ||
      normalized.includes('not found') ||
      normalized.includes('invalid'))
  );
}

export function clampUsdcInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return '';

  const [wholeRaw = '', fractionRaw = ''] = cleaned.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '');
  const fraction = fractionRaw.slice(0, 6);
  const normalized = cleaned.includes('.') ? `${whole || '0'}.${fraction}` : whole || '0';

  try {
    const minor = parseUnits(normalized, 6);
    if (minor > BigInt(MAX_USDC_MINOR)) {
      return '999999999999999.999999';
    }
  } catch {
    return normalized;
  }

  return normalized;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timerId = setTimeout(() => {
          reject(new Error(`${label} timed out`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}
