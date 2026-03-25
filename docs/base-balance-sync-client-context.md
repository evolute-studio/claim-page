# Base Balance Sync Client Context

## Purpose
- Capture the current client architecture before integrating backend-owned Base USDC balance sync.
- New backend surface to integrate:
  - `POST /v1/wallet/address`
  - `GET /v1/wallet/balance`
- Focus areas: auth/linkage prerequisites, active wallet address ownership, current onchain balance reads, existing pollers, and safest integration seams.

## Runtime/auth model
- App root is wrapped in `PrivyProviderWrapper` at `app/layout.tsx:44-52`.
- Privy config lives in `lib/privy.tsx:24-48`:
  - Google/Apple login
  - embedded Ethereum wallets
  - default chain from `getSourceChain()`
  - supported chains from `lib/chains.ts`
- `/` is not the wallet login flow. It redirects authenticated users to `/app` and otherwise tells them to open from game: `app/page.tsx:31-41`.
- `/launch` is the canonical wallet auth + linkage flow: `app/launch/page.tsx`.

## Existing wallet auth + linkage flow
- `app/launch/page.tsx`:
  - reads `code` and optional `token` from query params: `app/launch/page.tsx:300-303`
  - reads a device id from query/localStorage/cookies: `app/launch/page.tsx:160-190`
  - deduplicates exchange requests with in-memory caches: `app/launch/page.tsx:33-35`, `app/launch/page.tsx:270-296`
- Backend wallet endpoints already used by this client:
  - `POST /v1/wallet/exchange-code` via `exchangeWalletLaunchCode()`: `lib/api.ts:268-291`
  - `POST /v1/wallet/session-linked` via `markWalletSessionLinked()`: `lib/api.ts:293-322`
- `POST /v1/wallet/launch` is not called from this repo. Launch context is created outside this web client.
- Launch success path:
  1. exchange `code` through `exchangeLaunchCodeSingle()`: `app/launch/page.tsx:270-296`, `app/launch/page.tsx:423-435`
  2. if needed, authenticate into Privy with backend JWT: `app/launch/page.tsx:343-348`, `app/launch/page.tsx:442-477`
  3. resolve Privy identity token with `resolvePrivyIdentityToken()`: `app/launch/page.tsx:357-365`, `lib/identityToken.ts:50-121`
  4. finalize linkage with `markWalletSessionLinked()`: `app/launch/page.tsx:371-379`
  5. redirect to `/app?tab=wallet` or claim flow through `buildPostLaunchDestination()`: `app/launch/page.tsx:248-264`, `app/launch/page.tsx:391-392`
- Session linkage is therefore a hard prerequisite for new balance endpoints.

## Token and identity model
- Current Privy user id comes from `usePrivy().user.id`.
- Identity tokens are resolved through `resolvePrivyIdentityToken()` in `lib/identityToken.ts:50-121`.
- Resolution strategy:
  - use cached `useIdentityToken()` value if JWT `sub` matches current `user.id`
  - otherwise call `getIdentityToken()`
- JWT `sub` parsing happens in `readJwtSub()` at `lib/identityToken.ts:23-37`.
- Most authenticated components already follow this pattern:
  - `WalletPanel`
  - `HistoryPanel`
  - `PayoutsPanel`
  - `WithdrawalsPanel`
  - `ClaimDecisionPage`

## App shell and screen structure
- Main wallet UI lives in `/app`: `app/app/page.tsx:80-420`.
- `AppPage` ensures an embedded wallet exists after auth: `app/app/page.tsx:121-138`.
- Current active client address is derived from `wallets[0]?.address`:
  - `app/app/page.tsx:106`
  - `components/WalletPanel.tsx:543`
  - `app/claim/decision/page.tsx:95-100`
- Header in `/app` already displays that active address: `app/app/page.tsx:308-358`.
- Both main screens remain mounted at the same time:
  - `WalletPanel`: `app/app/page.tsx:381-388`
  - `HistoryPanel`: `app/app/page.tsx:395-400`
- Tabs are switched only with CSS translation + pointer-events, not mount/unmount: `app/app/page.tsx:371-401`.

## Current direct Base RPC usage
- `WalletPanel` creates a `viem` public client with `http()` against the configured source chain: `components/WalletPanel.tsx:439-445`.
- Source chain and USDC addresses come from CCTP config:
  - chain resolution: `lib/cctp.ts:62-68`
  - config and USDC address selection: `lib/cctp.ts:87-136`
  - fallback chain metadata: `lib/chains.ts:21-37`
- Current USDC balance is read directly onchain with `balanceOf`:
  - `components/WalletPanel.tsx:544-554`
- Current allowance is read directly onchain with `allowance(owner, spender)`:
  - `components/WalletPanel.tsx:1378-1386`
- The new backend balance system should replace the passive `balanceOf` read, but not necessarily allowance yet.

## Current balance hook and UI dependencies
- `useWithdrawBalance()` lives in `lib/useWithdrawBalance.ts:11-84`.
- It:
  - fetches immediately on dependency changes: `lib/useWithdrawBalance.ts:27-67`
  - polls every 20s: `lib/useWithdrawBalance.ts:69-75`
  - exposes `balance`, `balanceMinor`, `balanceError`, `balanceLoading`, `refreshBalance`
- `WalletPanel` consumes that hook at `components/WalletPanel.tsx:555-559`.
- Current balance affects:
  - header display formatting: `components/WalletPanel.tsx:826-835`, `components/WalletPanel.tsx:2117-2127`
  - error/skeleton UI: `components/WalletPanel.tsx:2118-2123`
  - network availability gating: `components/WalletPanel.tsx:588-610`
  - max receivable math: `components/WalletPanel.tsx:841-855`
  - insufficient balance validation: `components/WalletPanel.tsx:857-881`
  - explicit refresh when withdraw review opens: `components/WalletPanel.tsx:883-886`
- Main migration seam: keep the hook contract stable and swap its data source from onchain RPC to backend balance API.

## Other existing backend data flows and pollers
- `WalletPanel` claimable payouts:
  - loads via `getMyPayouts()`: `components/WalletPanel.tsx:1660-1719`
  - polls every 20s while withdraw modal is closed: `components/WalletPanel.tsx:1808-1817`
- `HistoryPanel`:
  - loads payouts + withdrawals in parallel: `components/HistoryPanel.tsx:145-203`
  - refreshes on focus query changes: `components/HistoryPanel.tsx:213-221`
  - polls every 12s: `components/HistoryPanel.tsx:223-231`
- `useWithdrawalStatus()` polls `/withdrawal/get` every 12s while a withdrawal is active: `lib/useWithdrawalStatus.ts:50-99`
- `useNetworkFeeEstimates()` fetches quote-derived fee estimates when wallet tab is active / prefetch enabled: `components/WalletPanel.tsx:574-587`, `lib/useNetworkFeeEstimates.ts:64-220`
- `useWithdrawalQuote()` retries/refreshes quotes around expiry: `lib/useWithdrawalQuote.ts:79-257`
- Legacy standalone components still exist:
  - `PayoutsPanel` has its own initial load + 20s polling when payouts are in flight: `components/PayoutsPanel.tsx:75-130`, `components/PayoutsPanel.tsx:179-191`
  - `WithdrawalsPanel` loads on demand, no auto-poll: `components/WithdrawalsPanel.tsx:85-114`

## Existing backend API surface already used by client
- Wallet:
  - `POST /v1/wallet/exchange-code`: `lib/api.ts:268-291`
  - `POST /v1/wallet/session-linked`: `lib/api.ts:293-322`
- Claims:
  - `GET /claim/preview`: `lib/api.ts:577-589`
  - `POST /claim/confirm`: `lib/api.ts:591-657`
- Payouts:
  - `GET /payouts/me`: `lib/api.ts:669-795`
- Withdrawals:
  - `POST /withdrawal/quote`: `lib/api.ts:797-836`
  - `POST /withdrawal/create`: `lib/api.ts:838-879`
  - `POST /withdrawal/burn-submitted`: `lib/api.ts:881-926`
  - `POST /withdrawal/cancel`: `lib/api.ts:928-967`
  - `GET /withdrawal/get`: `lib/api.ts:969-995`
  - `GET /withdrawal/list`: `lib/api.ts:997-1032`
- There are currently no wrappers for:
  - `POST /v1/wallet/address`
  - `GET /v1/wallet/balance`

## Integration constraints for new balance sync
- New balance endpoints must reuse the existing Privy identity token flow. No parallel auth path should be introduced.
- `POST /v1/wallet/address` and `GET /v1/wallet/balance` must only run after `/v1/wallet/session-linked` has completed successfully in `/launch`.
- Current client assumption already matches backend's single-active-address model: the app only uses `wallets[0]?.address`.
- New error codes expected by UI/hook layer:
  - `IDENTITY_NOT_LINKED`
  - `BALANCE_NOT_TRACKED`
  - `ADDRESS_INVALID`
  - `ADDRESS_CONFLICT`
- `ClaimDecisionPage` does not currently read balance, so new balance sync is primarily a wallet screen concern for now.

## Best integration seams
- API layer:
  - add typed wrappers in `lib/api.ts` next to existing wallet helpers
- Address registration:
  - safest local seam: `WalletPanel`, because it already owns active address + balance consumer
  - possible centralized seam: `AppPage`, because it already owns auth readiness, embedded wallet creation, and active address
- Balance polling:
  - best seam is replacing or repurposing `useWithdrawBalance()`
  - keep return shape stable to minimize `WalletPanel` churn
- Allowance:
  - keep current onchain `allowance` read for now unless backend exposes it too

## Request duplication risks
- Hidden screens remain mounted in `/app`, so background pollers keep running.
- `HistoryPanel` gets `isActive` but does not gate polling on it; the prop is currently visual-only.
- `WalletPanel` gates fee prefetch with `isActive`, but does not gate:
  - claimable payouts polling
  - current balance polling through `useWithdrawBalance()`
- If new address registration or balance polling is added in more than one component, duplicate `POST /v1/wallet/address` and `GET /v1/wallet/balance` calls are likely.
- Query-driven focus refreshes in `HistoryPanel` should stay decoupled from wallet balance refresh logic.

## Practical first implementation shape
1. Add typed helpers for `POST /v1/wallet/address` and `GET /v1/wallet/balance` in `lib/api.ts`.
2. Replace `useWithdrawBalance()` internals, or add a new backend balance hook with the same outward contract.
3. Register `wallets[0]?.address` after auth/linkage and when the active address changes.
4. Poll `GET /v1/wallet/balance` only while the wallet screen is relevant, plus on explicit refresh points already present in withdraw flow.
5. Keep allowance onchain for now.

## Likely files to touch in integration
- `lib/api.ts`
- `lib/useWithdrawBalance.ts` or a new wallet balance hook
- `components/WalletPanel.tsx`
- optionally `app/app/page.tsx` if address registration becomes app-shell-owned
- optionally shared types for the new wallet balance response
