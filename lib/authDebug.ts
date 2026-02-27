const AUTH_DEBUG_ENABLED =
  (process.env.NEXT_PUBLIC_AUTH_DEBUG ?? '').trim().toLowerCase() === 'true';

type AuthDebugPayload = Record<string, unknown>;

type AuthDebugEntry = {
  ts: number;
  event: string;
  data: AuthDebugPayload;
};

declare global {
  interface Window {
    __evoluteAuthDebug?: AuthDebugEntry[];
  }
}

export function isAuthDebugEnabled(): boolean {
  return AUTH_DEBUG_ENABLED;
}

export function createAuthTraceId(prefix = 'auth'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function tokenFingerprint(token: string): string {
  const normalized = token.trim();
  if (!normalized) return 'empty';
  if (normalized.length <= 20) return normalized;
  return `${normalized.slice(0, 10)}...${normalized.slice(-10)}`;
}

export function authDebug(event: string, data: AuthDebugPayload): void {
  if (!AUTH_DEBUG_ENABLED) return;
  const entry: AuthDebugEntry = { ts: Date.now(), event, data };

  if (typeof window !== 'undefined') {
    const list = window.__evoluteAuthDebug ?? [];
    list.push(entry);
    window.__evoluteAuthDebug = list.slice(-300);
  }

  console.warn(`[auth-debug] ${event}`, data);
}
