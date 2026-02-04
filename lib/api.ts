import {
  PayoutListResponse,
  PayoutPreview,
  ConfirmResponse,
  StatusResponse,
} from '@/types/payout';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

function getApiBaseOrThrow(): string {
  const value = API_BASE?.trim();
  if (!value) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL is not configured. Set it in your environment variables.'
    );
  }
  return value.replace(/\/+$/, '');
}

function readStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function normalizePayout(raw: unknown): PayoutPreview | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const claimToken = readStringField(record, ['claim_token', 'claimToken', 'token']);
  const payoutId = readStringField(record, ['payout_id', 'payoutId']);
  const id = readStringField(record, ['id']);
  const asset = readStringField(record, ['asset']) ?? 'USDC';
  const chain = readStringField(record, ['chain']) ?? 'Base';
  const amountFormatted = readStringField(record, ['amount_formatted', 'amountFormatted']) ?? '';
  const status = readStringField(record, ['status']) as PayoutPreview['status'] | undefined;
  const recipientEmail =
    readStringField(record, ['recipient_email', 'recipientEmail', 'email']) ?? '';

  const amountMinorUnits = Number(record.amount_minor_units ?? record.amountMinorUnits ?? 0);
  const expiresAt = Number(record.expires_at ?? record.expiresAt ?? 0);

  if (!status || Number.isNaN(amountMinorUnits) || Number.isNaN(expiresAt)) {
    return null;
  }

  return {
    ...record,
    id,
    payout_id: payoutId,
    claim_token: claimToken,
    asset,
    chain,
    amount_formatted: amountFormatted,
    amount_minor_units: amountMinorUnits,
    status,
    recipient_email: recipientEmail,
    expires_at: expiresAt,
    created_at: Number(record.created_at ?? record.createdAt ?? 0) || undefined,
    updated_at: Number(record.updated_at ?? record.updatedAt ?? 0) || undefined,
    claimed_at: Number(record.claimed_at ?? record.claimedAt ?? 0) || undefined,
    paid_at: Number(record.paid_at ?? record.paidAt ?? 0) || undefined,
    tx_hash:
      readStringField(record, ['tx_hash', 'txHash', 'transaction_hash', 'transactionHash']) ??
      undefined,
    failure_reason:
      readStringField(record, ['failure_reason', 'failureReason', 'error', 'reason']) ?? undefined,
    rank: Number(record.rank ?? 0) || undefined,
  };
}

export async function getClaimPreview(
  token: string,
  init?: RequestInit
): Promise<PayoutPreview> {
  const apiBase = getApiBaseOrThrow();
  const url = `${apiBase}/claim/preview?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, init);
  if (res.status === 404) {
    const error = await res.json().catch(() => ({ message: 'Invalid or expired token' }));
    throw new Error(error.message || 'Invalid or expired token');
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Failed to load claim' }));
    throw new Error(error.message || 'Failed to load claim');
  }
  return res.json();
}

export async function confirmClaim(
  token: string,
  walletAddress: string,
  privyIdentityToken: string
): Promise<ConfirmResponse> {
  return confirmClaimInternal(
    {
      claim_token: token,
      wallet_address: walletAddress,
      privy_identity_token: privyIdentityToken,
    },
    'Claim failed'
  );
}

export async function confirmClaimByPayoutId(
  payoutId: string,
  walletAddress: string,
  privyIdentityToken: string
): Promise<ConfirmResponse> {
  return confirmClaimInternal(
    {
      payout_id: payoutId,
      wallet_address: walletAddress,
      privy_identity_token: privyIdentityToken,
    },
    'Claim failed'
  );
}

async function confirmClaimInternal(
  body: {
    claim_token?: string;
    payout_id?: string;
    wallet_address: string;
    privy_identity_token: string;
  },
  fallbackError: string
): Promise<ConfirmResponse> {
  const apiBase = getApiBaseOrThrow();
  const url = `${apiBase}/claim/confirm`;
  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
  const res = await fetch(url, options);

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || fallbackError);
  }
  return data;
}

export async function getClaimStatus(payoutId: string): Promise<StatusResponse> {
  const apiBase = getApiBaseOrThrow();
  const url = `${apiBase}/claim/status?payout_id=${encodeURIComponent(payoutId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to get status');
  }
  return res.json();
}

export async function getMyPayouts(
  privyIdentityToken: string,
  cursor?: string
): Promise<PayoutListResponse> {
  const apiBase = getApiBaseOrThrow();
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const url = `${apiBase}/payouts/me${query}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${privyIdentityToken}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Failed to load payouts');
  }

  const payoutsRaw = Array.isArray(data.payouts) ? data.payouts : [];
  const payouts = payoutsRaw
    .map((item) => normalizePayout(item))
    .filter((item): item is PayoutPreview => item !== null);

  return {
    payouts,
    next_cursor: data.next_cursor ?? null,
  };
}
