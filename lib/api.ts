import { PayoutPreview, ConfirmResponse, StatusResponse } from '@/types/payout';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

function logRequestStart(label: string, url: string, options?: RequestInit) {
  const method = options?.method ?? 'GET';
  const headers = options?.headers ?? {};
  const hasBody = !!options?.body;
  const safeHeaders = { ...headers };
  if (typeof safeHeaders === 'object' && safeHeaders) {
    if ('Authorization' in safeHeaders) {
      safeHeaders.Authorization = '[redacted]';
    }
  }
  console.info(`[api] ${label} -> ${method} ${url}`, { headers: safeHeaders, hasBody });
}

async function logResponse(label: string, res: Response) {
  const contentType = res.headers.get('content-type') ?? '';
  try {
    // Intentionally ignore body parsing to avoid logging sensitive data.
  } catch {
    // Ignore
  }
  console.info(`[api] ${label} <- ${res.status} ${res.statusText}`, {
    ok: res.ok,
    contentType,
  });
}

export async function getClaimPreview(token: string): Promise<PayoutPreview> {
  const url = `${API_BASE}/claim/preview?token=${encodeURIComponent(token)}`;
  logRequestStart('getClaimPreview', url);
  const res = await fetch(url);
  await logResponse('getClaimPreview', res);
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
  const url = `${API_BASE}/claim/confirm`;
  const body = {
    claim_token: token,
    wallet_address: walletAddress,
    privy_identity_token: privyIdentityToken,
  };
  console.info('[api] confirmClaim body keys', Object.keys(body));
  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
  logRequestStart('confirmClaim', url, options);
  const res = await fetch(url, options);
  await logResponse('confirmClaim', res);

  const data = await res.json();
  if (!res.ok) {
    if (data?.message) {
      console.warn('[api] confirmClaim error message', data.message);
    }
    throw new Error(data.message || 'Claim failed');
  }
  return data;
}

export async function getClaimStatus(payoutId: string): Promise<StatusResponse> {
  const url = `${API_BASE}/claim/status?payout_id=${encodeURIComponent(payoutId)}`;
  logRequestStart('getClaimStatus', url);
  const res = await fetch(url);
  await logResponse('getClaimStatus', res);
  if (!res.ok) {
    throw new Error('Failed to get status');
  }
  return res.json();
}
