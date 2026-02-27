import {
  PayoutListResponse,
  PayoutPreview,
  PayoutStatus,
  ConfirmResponse,
  StatusResponse,
} from '@/types/payout';
import type {
  BurnSubmittedResponse,
  CreateWithdrawalResponse,
  DestinationChain,
  WithdrawalQuoteResponse,
  WithdrawalListItem,
  WithdrawalListResponse,
  WithdrawalStatusResponse,
} from '@/types/withdrawal';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const WALLET_REQUEST_TIMEOUT_MS = 8_000;

export type WalletSessionConflictPolicy =
  | 'prompt_switch'
  | 'force_switch'
  | 'deny_if_mismatch';

export type WalletExchangeErrorCode =
  | 'CODE_NOT_FOUND'
  | 'CODE_EXPIRED'
  | 'CODE_ALREADY_USED'
  | 'DEVICE_MISMATCH'
  | 'PAYOUT_TOKEN_REQUIRED'
  | 'PAYOUT_TOKEN_INVALID'
  | 'WALLET_PROVIDER_NOT_ALLOWED'
  | 'PRIVY_AUTH_NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT';

export type WalletExchangeCodeRequest = {
  code: string;
  token?: string;
  client_nonce: string;
};

export type WalletSessionLinkedRequest = {
  external_user_id: string;
  privy_user_id?: string;
  status: 'success';
};

type WalletExchangeCodeErrorPayload = {
  error_code?: string;
  code?: string;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

export type WalletExchangeCodeSuccess = {
  auth_type: 'custom_jwt' | string;
  jwt?: string;
  expires_in_sec: number;
  expected_user: {
    external_user_id: string;
    email_hint?: string;
  };
  session_conflict_policy: WalletSessionConflictPolicy;
  wallet_intent?: {
    screen?: string;
    [key: string]: unknown;
  };
  payout_context?: {
    payout_id?: string;
    claim_token?: string;
    [key: string]: unknown;
  };
};

export class WalletApiError extends Error {
  code: WalletExchangeErrorCode;
  status: number;

  constructor(message: string, code: WalletExchangeErrorCode, status = 0) {
    super(message);
    this.name = 'WalletApiError';
    this.code = code;
    this.status = status;
  }
}

function readWalletErrorCode(raw: unknown): WalletExchangeErrorCode {
  if (typeof raw !== 'string') return 'INTERNAL_ERROR';
  if (
    raw === 'CODE_NOT_FOUND' ||
    raw === 'CODE_EXPIRED' ||
    raw === 'CODE_ALREADY_USED' ||
    raw === 'DEVICE_MISMATCH' ||
    raw === 'PAYOUT_TOKEN_REQUIRED' ||
    raw === 'PAYOUT_TOKEN_INVALID' ||
    raw === 'WALLET_PROVIDER_NOT_ALLOWED' ||
    raw === 'PRIVY_AUTH_NOT_CONFIGURED' ||
    raw === 'RATE_LIMITED' ||
    raw === 'VALIDATION_ERROR' ||
    raw === 'INTERNAL_ERROR'
  ) {
    return raw;
  }
  return 'INTERNAL_ERROR';
}

function readWalletErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as Record<string, unknown>;
  const nestedError = record.error;
  if (nestedError && typeof nestedError === 'object') {
    const message = (nestedError as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }
  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message.trim();
  }
  return fallback;
}

function readWalletErrorCodeFromPayload(payload: unknown): WalletExchangeErrorCode {
  if (!payload || typeof payload !== 'object') return 'INTERNAL_ERROR';
  const record = payload as Record<string, unknown>;
  const nestedError = record.error;
  if (nestedError && typeof nestedError === 'object') {
    const nestedCode = (nestedError as Record<string, unknown>).code;
    const parsedNestedCode = readWalletErrorCode(nestedCode);
    if (parsedNestedCode !== 'INTERNAL_ERROR' || nestedCode === 'INTERNAL_ERROR') {
      return parsedNestedCode;
    }
  }
  const directCode = record.error_code ?? record.code;
  return readWalletErrorCode(directCode);
}

async function fetchWalletJson<T>(
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string
): Promise<T> {
  const apiBase = getApiBaseOrThrow();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WALLET_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as
      | WalletExchangeCodeErrorPayload
      | Record<string, unknown>;

    if (!res.ok) {
      const code = readWalletErrorCodeFromPayload(data);
      const message = readWalletErrorMessage(data, fallbackErrorMessage);
      throw new WalletApiError(message, code, res.status);
    }

    return data as T;
  } catch (error: unknown) {
    if (error instanceof WalletApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new WalletApiError('Request timed out. Please try again.', 'TIMEOUT');
    }
    throw new WalletApiError('Network error. Check connection and try again.', 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeoutId);
  }
}

function getApiBaseOrThrow(): string {
  const value = API_BASE?.trim();
  if (!value) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL is not configured. Set it in your environment variables.'
    );
  }
  return value.replace(/\/+$/, '');
}

function getAuthHeaders(privyIdentityToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${privyIdentityToken}`,
  };
}

export async function exchangeWalletLaunchCode(
  payload: WalletExchangeCodeRequest,
  options?: {
    deviceId?: string | null;
  }
): Promise<WalletExchangeCodeSuccess> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const normalizedDeviceId = options?.deviceId?.trim();
  if (normalizedDeviceId) {
    headers['X-Device-Id'] = normalizedDeviceId;
  }

  return fetchWalletJson<WalletExchangeCodeSuccess>(
    '/v1/wallet/exchange-code',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    },
    'Failed to launch wallet'
  );
}

export async function markWalletSessionLinked(
  payload: WalletSessionLinkedRequest,
  privyIdentityToken: string,
  options?: {
    deviceId?: string | null;
  }
): Promise<void> {
  const normalizedPrivyIdentityToken = privyIdentityToken.trim();
  if (!normalizedPrivyIdentityToken) {
    throw new WalletApiError('Missing identity token.', 'INTERNAL_ERROR');
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${normalizedPrivyIdentityToken}`,
  };
  const normalizedDeviceId = options?.deviceId?.trim();
  if (normalizedDeviceId) {
    headers['X-Device-Id'] = normalizedDeviceId;
  }

  await fetchWalletJson<Record<string, unknown>>(
    '/v1/wallet/session-linked',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    },
    'Failed to confirm wallet session'
  );
}

const DEST_DOMAIN_BY_CHAIN: Record<DestinationChain, number> = {
  base: 6,
  ethereum: 0,
  arbitrum: 3,
  optimism: 2,
  polygon: 7,
  avalanche: 1,
  linea: 11,
};

/*
Field mapping (frontend -> backend)

Quote:
- transfer_amount_usdc_minor -> amount_minor (backend treats as "receive" amount)
- fee_protocol_usdc_minor -> bridge_fee_minor
- fee_forward_usdc_minor -> forward_fee_minor
- max_fee_usdc_minor -> total_fee_minor (when max_fee_usdc_minor missing)
- total_burn_usdc_minor -> (not returned by backend; derived on frontend)
- expires_at -> expires_at (Unix seconds)

Withdrawal list/status:
- id -> withdrawal_id
- transfer_amount_usdc_minor -> amount_minor / net_amount_minor
- total_burn_usdc_minor -> total_amount_minor (optional)
- max_fee_usdc_minor -> total_fee_minor
- fee_protocol_usdc_minor -> bridge_fee_minor
- fee_forward_usdc_minor -> forward_fee_minor
- burn_tx_hash -> burn_tx_hash
- forward_tx_hash -> forward_tx_hash
- failure_reason -> error_msg / error
- created_at / updated_at -> Unix ms
*/

function toApiDestChain(chain: DestinationChain): string {
  return chain === 'optimism' ? 'op' : chain;
}

function toUiDestChain(chain: unknown, fallback: DestinationChain): DestinationChain {
  if (typeof chain !== 'string') return fallback;
  if (chain === 'op') return 'optimism';
  if (chain === 'optimism') return 'optimism';
  if (chain === 'base') return 'base';
  if (chain === 'ethereum') return 'ethereum';
  if (chain === 'arbitrum') return 'arbitrum';
  if (chain === 'polygon') return 'polygon';
  if (chain === 'avalanche') return 'avalanche';
  if (chain === 'linea') return 'linea';
  return fallback;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeWithdrawalQuote(
  raw: Record<string, unknown>,
  fallbackDestChain: DestinationChain
): WithdrawalQuoteResponse {
  const destChain = toUiDestChain(raw.dest_chain, fallbackDestChain);
  const destDomainId =
    toNumber(raw.dest_domain_id ?? raw.destDomainId) || DEST_DOMAIN_BY_CHAIN[destChain];

  const transferAmount =
    toNumber(raw.transfer_amount_usdc_minor ?? raw.amount_minor ?? raw.net_amount_minor) || 0;
  const feeProtocol =
    toNumber(raw.fee_protocol_usdc_minor ?? raw.bridge_fee_minor) || 0;
  const feeForward =
    toNumber(raw.fee_forward_usdc_minor ?? raw.forward_fee_minor) || 0;
  const maxFee =
    toNumber(raw.max_fee_usdc_minor ?? raw.total_fee_minor) || feeProtocol + feeForward;
  const totalBurn =
    toNumber(raw.total_burn_usdc_minor) || transferAmount + maxFee;

  const quoteId = typeof raw.quote_id === 'string' ? raw.quote_id : '';
  if (!quoteId) {
    throw new Error('Quote response missing quote_id');
  }

  return {
    quote_id: quoteId,
    source_chain: 'base',
    source_domain_id: 6,
    dest_chain: destChain,
    dest_domain_id: destDomainId,
    transfer_amount_usdc_minor: transferAmount,
    finality_threshold: toNumber(raw.finality_threshold ?? raw.finalityThreshold) || 1000,
    forward_fee_level: (raw.forward_fee_level as WithdrawalQuoteResponse['forward_fee_level']) ?? 'med',
    fee_protocol_usdc_minor: feeProtocol,
    fee_forward_usdc_minor: feeForward,
    max_fee_usdc_minor: maxFee,
    total_burn_usdc_minor: totalBurn,
    expires_at: toNumber(raw.expires_at ?? raw.expiresAt),
  };
}

function normalizeWithdrawal(raw: Record<string, unknown>): WithdrawalListItem | null {
  const id = readStringField(raw, ['withdrawal_id', 'id', 'withdrawalId']);
  const status = readStringField(raw, ['status', 'state']) as WithdrawalListItem['status'] | undefined;
  const destChain = toUiDestChain(raw.dest_chain ?? raw.chain, 'ethereum');

  if (!id || !status) return null;

  const transferAmount =
    toNumber(
      raw.net_amount_minor ??
        raw.amount_minor ??
        raw.transfer_amount_usdc_minor ??
        raw.amount
    ) || 0;
  const feeProtocol = toNumber(raw.fee_protocol_usdc_minor ?? raw.bridge_fee_minor) || 0;
  const feeForward = toNumber(raw.fee_forward_usdc_minor ?? raw.forward_fee_minor) || 0;
  const maxFee =
    toNumber(raw.max_fee_usdc_minor ?? raw.total_fee_minor) || feeProtocol + feeForward;
  const totalBurn =
    toNumber(raw.total_burn_usdc_minor ?? raw.total_amount_minor) || transferAmount + maxFee;

  return {
    id,
    status,
    dest_chain: destChain,
    dest_address: readStringField(raw, ['dest_address', 'destination_address', 'to', 'recipient']) ?? null,
    transfer_amount_usdc_minor: transferAmount,
    total_burn_usdc_minor: totalBurn,
    max_fee_usdc_minor: maxFee,
    fee_forward_usdc_minor: feeForward,
    fee_protocol_usdc_minor: feeProtocol,
    burn_tx_hash: readStringField(raw, ['burn_tx_hash', 'burnTxHash', 'tx_hash']) ?? null,
    forward_tx_hash: readStringField(raw, ['forward_tx_hash', 'forwardTxHash']) ?? null,
    created_at: toNumber(raw.created_at ?? raw.createdAt) || null,
    updated_at: toNumber(raw.updated_at ?? raw.updatedAt) || null,
    burn_tx_at: toNumber(raw.burn_tx_at ?? raw.burnTxAt) || null,
    forward_tx_at: toNumber(raw.forward_tx_at ?? raw.forwardTxAt) || null,
    failure_reason:
      readStringField(raw, ['failure_reason', 'failureReason', 'error', 'error_msg']) ?? null,
  };
}

function normalizeWithdrawalStatus(
  raw: Record<string, unknown>
): WithdrawalStatusResponse {
  const id = readStringField(raw, ['withdrawal_id', 'id', 'withdrawalId']);
  const status = readStringField(raw, ['status', 'state']) as WithdrawalStatusResponse['status'] | undefined;
  if (!id || !status) {
    throw new Error('Invalid withdrawal status response');
  }
  return {
    id,
    status,
    burn_tx_hash: readStringField(raw, ['burn_tx_hash', 'burnTxHash', 'tx_hash']) ?? null,
    forward_tx_hash: readStringField(raw, ['forward_tx_hash', 'forwardTxHash']) ?? null,
    failure_reason:
      readStringField(raw, ['failure_reason', 'failureReason', 'error', 'error_msg']) ?? null,
  };
}

function readStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readTournamentName(record: Record<string, unknown>): string | undefined {
  const direct = readStringField(record, [
    'tournament_name',
    'tournamentName',
    'tournament_title',
    'tournamentTitle',
    'event_name',
    'eventName',
  ]);
  if (direct) return direct;

  const tournament = record.tournament;
  if (tournament && typeof tournament === 'object') {
    return readStringField(tournament as Record<string, unknown>, ['name', 'title']);
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
    readStringField(record, ['recipient_email', 'recipientEmail', 'email']) ?? undefined;

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
    tournament_name: readTournamentName(record) ?? undefined,
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
      privy_access_token: privyIdentityToken,
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
      privy_access_token: privyIdentityToken,
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
    privy_access_token?: string;
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
  const DEFAULT_PAYOUT_PAGE_LIMIT = 50;
  const DEFAULT_PAYOUT_STATUSES: PayoutStatus[] = ['CREATED', 'PAID'];
  const parseOffsetCursor = (rawCursor: string): number | null => {
    const match = rawCursor.match(/^offset:(\d+)$/);
    if (!match?.[1]) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const readFiniteNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  };

  const normalizedCursor = cursor?.trim() ?? '';
  const offsetCursor = normalizedCursor ? parseOffsetCursor(normalizedCursor) : null;
  const apiBase = getApiBaseOrThrow();
  const query = new URLSearchParams();
  if (normalizedCursor && offsetCursor === null) {
    query.set('cursor', normalizedCursor);
  } else {
    query.set('status', DEFAULT_PAYOUT_STATUSES.join(','));
    query.set('limit', String(DEFAULT_PAYOUT_PAGE_LIMIT));
    query.set('offset', String(offsetCursor ?? 0));
  }
  const url = `${apiBase}/payouts/me?${query.toString()}`;

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
    .map((item: unknown) => normalizePayout(item))
    .filter((item: PayoutPreview | null): item is PayoutPreview => item !== null);

  const rawTotal = readFiniteNumber(data.total);
  const rawLimit = readFiniteNumber(data.limit);
  const rawOffset = readFiniteNumber(data.offset);
  const normalizedOffset = rawOffset ?? offsetCursor ?? 0;
  const normalizedLimit = rawLimit ?? DEFAULT_PAYOUT_PAGE_LIMIT;

  let nextCursor: string | null =
    typeof data.next_cursor === 'string' && data.next_cursor.trim()
      ? data.next_cursor.trim()
      : null;
  if (!nextCursor && typeof rawTotal === 'number') {
    const nextOffset = normalizedOffset + payouts.length;
    if (nextOffset < rawTotal) {
      nextCursor = `offset:${nextOffset}`;
    }
  }

  return {
    payouts,
    next_cursor: nextCursor,
    total: rawTotal,
    limit: normalizedLimit,
    offset: normalizedOffset,
  };
}

export async function getWithdrawalQuote(
  privyIdentityToken: string,
  payload: {
    dest_chain: DestinationChain;
    transfer_amount_usdc_minor: number;
  }
): Promise<WithdrawalQuoteResponse> {
  const apiBase = getApiBaseOrThrow();
  const body = {
    ...payload,
    dest_chain: toApiDestChain(payload.dest_chain),
    amount_minor: payload.transfer_amount_usdc_minor,
  };
  const res = await fetch(`${apiBase}/withdrawal/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(privyIdentityToken),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Failed to fetch withdrawal quote');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid quote response');
  }
  return normalizeWithdrawalQuote(data as Record<string, unknown>, payload.dest_chain);
}

export async function createWithdrawal(
  privyIdentityToken: string,
  payload: {
    quote_id: string;
    dest_address: string;
  },
  idempotencyKey?: string
): Promise<CreateWithdrawalResponse> {
  const apiBase = getApiBaseOrThrow();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(privyIdentityToken),
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const res = await fetch(`${apiBase}/withdrawal/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Failed to create withdrawal');
  }
  return data;
}

export async function submitBurnTx(
  privyIdentityToken: string,
  withdrawalId: string,
  burnTxHash: string,
  idempotencyKey?: string
): Promise<BurnSubmittedResponse> {
  const apiBase = getApiBaseOrThrow();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(privyIdentityToken),
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const res = await fetch(`${apiBase}/withdrawal/burn-submitted`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      burn_tx_hash: burnTxHash,
      withdrawal_id: withdrawalId,
      id: withdrawalId,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Failed to submit burn transaction');
  }
  return data;
}

export async function getWithdrawalStatus(
  privyIdentityToken: string,
  withdrawalId: string
): Promise<WithdrawalStatusResponse> {
  const apiBase = getApiBaseOrThrow();
  const query = new URLSearchParams({
    id: withdrawalId,
    withdrawal_id: withdrawalId,
  }).toString();
  const res = await fetch(`${apiBase}/withdrawal/get?${query}`, {
    headers: getAuthHeaders(privyIdentityToken),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Failed to load withdrawal status');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid withdrawal status response');
  }
  return normalizeWithdrawalStatus(data as Record<string, unknown>);
}

export async function getMyWithdrawals(
  privyIdentityToken: string,
  cursor?: string
): Promise<WithdrawalListResponse> {
  const apiBase = getApiBaseOrThrow();
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await fetch(`${apiBase}/withdrawal/list${query}`, {
    headers: getAuthHeaders(privyIdentityToken),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Failed to load withdrawals');
  }

  const rawList = Array.isArray(data.withdrawals)
    ? data.withdrawals
    : Array.isArray(data.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];

  const withdrawals = rawList
    .map((item: unknown) =>
      item && typeof item === 'object'
        ? normalizeWithdrawal(item as Record<string, unknown>)
        : null
    )
    .filter((item: WithdrawalListItem | null): item is WithdrawalListItem => item !== null);

  return {
    withdrawals,
    next_cursor: data.next_cursor ?? null,
  };
}
