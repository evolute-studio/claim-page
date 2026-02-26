'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { usePrivy, useSyncJwtBasedAuthState } from '@privy-io/react-auth';
import type { User } from '@privy-io/react-auth';
import {
  exchangeWalletLaunchCode,
  markWalletSessionLinked,
  WalletApiError,
  type WalletExchangeCodeSuccess,
  type WalletExchangeErrorCode,
} from '@/lib/api';
import { LoadingSpinner } from '@/components/LoadingSpinner';

type LaunchScreen = 'loading' | 'open_from_game' | 'session_conflict' | 'error';

type LaunchErrorState = {
  title: string;
  message: string;
  code?: WalletExchangeErrorCode;
};

type ConflictState = {
  emailHint: string | null;
};

function EvoluteTopLogo() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[42vh] min-h-32 max-h-72 items-center justify-center">
      <Image
        src="/logo.svg"
        alt="Evolute"
        width={170}
        height={44}
        priority
        className="h-auto w-[150px]"
      />
    </div>
  );
}

function normalizeExternalUserId(user: User | null): string | null {
  if (!user) return null;
  const linked = user.linkedAccounts.find((account) => account.type === 'custom_auth');
  if (!linked) return null;
  return typeof linked.customUserId === 'string' && linked.customUserId.trim()
    ? linked.customUserId.trim()
    : null;
}

function generateClientNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function parseDeviceIdFromCookie(cookie: string): string | null {
  const match = cookie.match(/(?:^|;\s*)(?:device_id|deviceId|x-device-id)=([^;]+)/i);
  if (!match?.[1]) return null;
  try {
    const value = decodeURIComponent(match[1]).trim();
    return value || null;
  } catch {
    return null;
  }
}

function readDeviceIdFromBrowser(): string | null {
  if (typeof window === 'undefined') return null;
  const fromQuery = new URLSearchParams(window.location.search).get('device_id')?.trim() ?? '';
  if (fromQuery) return fromQuery;
  const fromStorage = (() => {
    try {
      return (
        window.localStorage.getItem('device_id') ??
        window.localStorage.getItem('deviceId') ??
        window.localStorage.getItem('x-device-id')
      );
    } catch {
      return null;
    }
  })();
  if (typeof fromStorage === 'string' && fromStorage.trim()) {
    return fromStorage.trim();
  }
  return parseDeviceIdFromCookie(document.cookie);
}

function clearLaunchQueryParams() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('token');
  const query = url.searchParams.toString();
  const next = `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

function toLaunchErrorState(error: unknown): LaunchErrorState {
  if (error instanceof WalletApiError) {
    switch (error.code) {
      case 'CODE_NOT_FOUND':
        return { title: 'Ссылка не найдена', message: 'Код запуска не найден.', code: error.code };
      case 'CODE_EXPIRED':
        return { title: 'Ссылка истекла', message: 'Код запуска уже истёк.', code: error.code };
      case 'CODE_ALREADY_USED':
        return { title: 'Ссылка использована', message: 'Код запуска уже использован.', code: error.code };
      case 'DEVICE_MISMATCH':
        return { title: 'Другое устройство', message: 'Откройте кошелёк на исходном устройстве.', code: error.code };
      case 'PAYOUT_TOKEN_REQUIRED':
        return { title: 'Нужен payout token', message: 'Для этого запуска требуется token.', code: error.code };
      case 'PAYOUT_TOKEN_INVALID':
        return { title: 'Некорректный token', message: 'Передан невалидный payout token.', code: error.code };
      case 'PRIVY_AUTH_NOT_CONFIGURED':
        return {
          title: 'Вход временно недоступен',
          message: 'Privy custom auth не настроен на сервере.',
          code: error.code,
        };
      case 'RATE_LIMITED':
        return { title: 'Слишком много попыток', message: 'Подождите немного и попробуйте снова.', code: error.code };
      case 'VALIDATION_ERROR':
        return { title: 'Ошибка запроса', message: 'Проверьте параметры запуска.', code: error.code };
      case 'TIMEOUT':
        return { title: 'Превышено время ожидания', message: error.message, code: error.code };
      case 'NETWORK_ERROR':
        return { title: 'Нет соединения', message: error.message, code: error.code };
      case 'INTERNAL_ERROR':
      default:
        return { title: 'Внутренняя ошибка', message: error.message, code: error.code };
    }
  }
  if (error instanceof Error) {
    return { title: 'Ошибка запуска', message: error.message };
  }
  return { title: 'Ошибка запуска', message: 'Что-то пошло не так. Попробуйте снова.' };
}

function buildAppDestination(exchange: WalletExchangeCodeSuccess): string {
  const params = new URLSearchParams();
  params.set('tab', 'wallet');

  if (exchange.payout_context?.claim_token) {
    params.set('focusToken', exchange.payout_context.claim_token);
  }
  if (exchange.payout_context?.payout_id) {
    params.set('focusPayout', exchange.payout_context.payout_id);
  }

  return `/app?${params.toString()}`;
}

function LaunchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code')?.trim() ?? '';
  const token = searchParams.get('token')?.trim() ?? '';
  const { ready, authenticated, user, logout } = usePrivy();

  const [screen, setScreen] = useState<LaunchScreen>('loading');
  const [errorState, setErrorState] = useState<LaunchErrorState | null>(null);
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);
  const [busy, setBusy] = useState(false);

  const deviceIdRef = useRef<string | null>(null);
  const launchStartedRef = useRef(false);
  const flowLockRef = useRef(false);
  const exchangeResponseRef = useRef<WalletExchangeCodeSuccess | null>(null);
  const readyRef = useRef(ready);
  const authenticatedRef = useRef(authenticated);
  const userRef = useRef(user);
  const jwtValueRef = useRef<string | undefined>(undefined);
  const jwtSubscribersRef = useRef(new Set<() => void>());

  useEffect(() => {
    readyRef.current = ready;
    authenticatedRef.current = authenticated;
    userRef.current = user;
  }, [ready, authenticated, user]);

  const subscribeJwtAuth = useCallback((onAuthStateChange: () => void) => {
    jwtSubscribersRef.current.add(onAuthStateChange);
    return () => {
      jwtSubscribersRef.current.delete(onAuthStateChange);
    };
  }, []);

  const notifyJwtAuthChanged = useCallback(() => {
    for (const listener of jwtSubscribersRef.current) {
      listener();
    }
  }, []);

  const setLaunchJwt = useCallback(
    (value: string | undefined) => {
      jwtValueRef.current = value;
      notifyJwtAuthChanged();
    },
    [notifyJwtAuthChanged]
  );

  useSyncJwtBasedAuthState({
    enabled: true,
    subscribe: subscribeJwtAuth,
    getExternalJwt: useCallback(async () => jwtValueRef.current, []),
  });

  const currentExternalUserId = useMemo(() => normalizeExternalUserId(user), [user]);

  const waitForCustomJwtLogin = useCallback(async (expectedExternalUserId: string): Promise<User> => {
    const startedAt = Date.now();
    const timeoutMs = 15_000;

    while (Date.now() - startedAt < timeoutMs) {
      if (readyRef.current && authenticatedRef.current && userRef.current) {
        const currentExternal = normalizeExternalUserId(userRef.current);
        if (currentExternal === expectedExternalUserId) {
          return userRef.current;
        }
      }
      await sleep(120);
    }

    throw new WalletApiError(
      'Не удалось завершить вход по launch ссылке. Попробуйте снова.',
      'INTERNAL_ERROR'
    );
  }, []);

  const finalizeSuccess = useCallback(
    async (exchange: WalletExchangeCodeSuccess, externalUserId: string, privyUserId: string) => {
      await markWalletSessionLinked(
        {
          external_user_id: externalUserId,
          privy_user_id: privyUserId,
          status: 'success',
        },
        { deviceId: deviceIdRef.current }
      );

      clearLaunchQueryParams();
      router.replace(buildAppDestination(exchange));
    },
    [router]
  );

  const executeFlow = useCallback(
    async (mode: 'initial' | 'retry' | 'force_switch') => {
      if (flowLockRef.current) return;
      if (!readyRef.current) return;

      flowLockRef.current = true;
      setBusy(true);
      setErrorState(null);
      setConflictState(null);
      setScreen('loading');

      try {
        const hasSession = authenticatedRef.current && !!userRef.current;
        if (!code) {
          if (hasSession) {
            router.replace('/app?tab=wallet');
          } else {
            setScreen('open_from_game');
          }
          return;
        }

        let exchange = exchangeResponseRef.current;
        if (!exchange || mode === 'retry') {
          exchange = await exchangeWalletLaunchCode(
            {
              code,
              ...(token ? { token } : {}),
              client_nonce: generateClientNonce(),
            },
            { deviceId: deviceIdRef.current }
          );
          exchangeResponseRef.current = exchange;
        }

        const expectedExternalUserId = exchange.expected_user?.external_user_id?.trim();
        if (!expectedExternalUserId) {
          throw new WalletApiError('Некорректный ответ launch API.', 'INTERNAL_ERROR');
        }

        if (!authenticatedRef.current || !userRef.current) {
          setLaunchJwt(exchange.jwt);
          const loggedInUser = await waitForCustomJwtLogin(expectedExternalUserId);
          await finalizeSuccess(exchange, expectedExternalUserId, loggedInUser.id);
          return;
        }

        const policy = mode === 'force_switch' ? 'force_switch' : exchange.session_conflict_policy;
        const currentExternal = normalizeExternalUserId(userRef.current);
        if (currentExternal === expectedExternalUserId) {
          await finalizeSuccess(exchange, expectedExternalUserId, userRef.current.id);
          return;
        }

        if (policy === 'deny_if_mismatch') {
          setErrorState({
            title: 'Доступ запрещён',
            message: 'Этот launch-код принадлежит другому аккаунту.',
          });
          setScreen('error');
          return;
        }

        if (policy === 'prompt_switch') {
          setConflictState({
            emailHint: exchange.expected_user.email_hint ?? null,
          });
          setScreen('session_conflict');
          return;
        }

        await logout();
        setLaunchJwt(exchange.jwt);
        const switchedUser = await waitForCustomJwtLogin(expectedExternalUserId);
        await finalizeSuccess(exchange, expectedExternalUserId, switchedUser.id);
      } catch (error: unknown) {
        setErrorState(toLaunchErrorState(error));
        setScreen('error');
      } finally {
        flowLockRef.current = false;
        setBusy(false);
      }
    },
    [code, finalizeSuccess, logout, router, setLaunchJwt, token, waitForCustomJwtLogin]
  );

  useEffect(() => {
    if (!ready) return;
    if (launchStartedRef.current) return;
    launchStartedRef.current = true;
    deviceIdRef.current = readDeviceIdFromBrowser();
    void executeFlow('initial');
  }, [executeFlow, ready]);

  const handleBackToGame = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }
    router.replace('/');
  }, [router]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
        <div className="absolute -right-20 bottom-24 h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
      </div>
      <EvoluteTopLogo />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
        <section className="animate-fade-in-up rounded-3xl border border-white/10 bg-[#111111]/95 p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
          <p className="text-xs font-medium tracking-[0.14em] text-gray-400">EVOLUTE WALLET</p>

          {screen === 'loading' ? (
            <>
              <h1 className="mt-3 text-2xl font-semibold leading-tight text-white">Запускаем кошелёк…</h1>
              <p className="mt-2 text-sm text-gray-400">
                Проверяем сессию и выполняем безопасный вход.
              </p>
              <div className="mt-5 inline-flex items-center justify-center">
                <LoadingSpinner size="lg" />
              </div>
            </>
          ) : null}

          {screen === 'open_from_game' ? (
            <>
              <h1 className="mt-3 text-2xl font-semibold leading-tight text-white">
                Откройте кошелёк из игры
              </h1>
              <p className="mt-2 text-sm text-gray-400">
                Launch-код не найден. Перейдите по ссылке из игрового клиента.
              </p>
              <button
                type="button"
                onClick={handleBackToGame}
                className="interactive-fx no-shimmer mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-transparent bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Вернуться в игру
              </button>
            </>
          ) : null}

          {screen === 'session_conflict' ? (
            <>
              <h1 className="mt-3 text-2xl font-semibold leading-tight text-white">Конфликт сессии</h1>
              <p className="mt-2 text-sm text-gray-400">
                В этом браузере открыт другой аккаунт.
                {conflictState?.emailHint ? ` Ожидаемый аккаунт: ${conflictState.emailHint}.` : ''}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Текущий пользователь: {currentExternalUserId ?? 'не определён'}
              </p>
              <button
                type="button"
                onClick={() => void executeFlow('force_switch')}
                disabled={busy}
                className="interactive-fx no-shimmer mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-transparent bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:bg-white/30"
              >
                {busy ? 'Переключение…' : 'Переключить аккаунт'}
              </button>
              <button
                type="button"
                onClick={() => setScreen('open_from_game')}
                className="interactive-fx no-shimmer mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-white/20 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07]"
              >
                Отмена
              </button>
            </>
          ) : null}

          {screen === 'error' ? (
            <>
              <h1 className="mt-3 text-2xl font-semibold leading-tight text-white">
                {errorState?.title ?? 'Ошибка запуска'}
              </h1>
              <p className="mt-2 text-sm text-gray-400">{errorState?.message}</p>
              {errorState?.code ? (
                <p className="mt-2 text-xs text-gray-500">Код ошибки: {errorState.code}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void executeFlow('retry')}
                disabled={busy}
                className="interactive-fx no-shimmer mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-transparent bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:bg-white/30"
              >
                {busy ? 'Пробуем снова…' : 'Попробовать снова'}
              </button>
              <button
                type="button"
                onClick={handleBackToGame}
                className="interactive-fx no-shimmer mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-white/20 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07]"
              >
                Вернуться в игру
              </button>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default function LaunchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
          <LoadingSpinner size="lg" />
        </div>
      }
    >
      <LaunchContent />
    </Suspense>
  );
}
