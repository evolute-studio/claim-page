function decodeBase64Url(input: string): string | null {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? `${normalized}${'='.repeat(4 - padding)}` : normalized;

  try {
    if (typeof globalThis.atob === 'function') {
      return globalThis.atob(padded);
    }
    const globalBuffer = (globalThis as { Buffer?: typeof Buffer }).Buffer;
    if (globalBuffer) {
      return globalBuffer.from(padded, 'base64').toString('utf8');
    }
  } catch {
    return null;
  }

  return null;
}

export function readJwtSub(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;

  const payloadRaw = decodeBase64Url(parts[1]);
  if (!payloadRaw) return null;

  try {
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    const sub = payload.sub;
    return typeof sub === 'string' && sub.trim() ? sub.trim() : null;
  } catch {
    return null;
  }
}

function normalizeToken(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value ? value : null;
}

function tokenMatchesExpectedUser(token: string, expectedPrivyUserId: string): boolean {
  const tokenSub = readJwtSub(token);
  return tokenSub === expectedPrivyUserId;
}

export async function resolvePrivyIdentityToken(options: {
  cachedToken?: string | null;
  expectedPrivyUserId?: string | null;
  fetchFreshToken: () => Promise<string | null>;
}): Promise<string> {
  const expectedPrivyUserId = options.expectedPrivyUserId?.trim() ?? '';
  const cachedToken = normalizeToken(options.cachedToken);
  if (
    cachedToken &&
    (!expectedPrivyUserId || tokenMatchesExpectedUser(cachedToken, expectedPrivyUserId))
  ) {
    return cachedToken;
  }

  try {
    const freshToken = normalizeToken(await options.fetchFreshToken());
    if (
      freshToken &&
      (!expectedPrivyUserId || tokenMatchesExpectedUser(freshToken, expectedPrivyUserId))
    ) {
      return freshToken;
    }
  } catch {
    // Fall through to unified error below.
  }

  if (expectedPrivyUserId) {
    throw new Error('Identity token does not match current wallet session. Please retry.');
  }
  throw new Error('Missing identity token. Please re-login.');
}

