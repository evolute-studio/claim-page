# WalletPanel Refactor Plan (No Behavior Change)

## Goal
Refactor `components/WalletPanel.tsx` without changing UX, visuals, API contract, or transaction flow.

## Hard Invariants
- API endpoints and payloads remain unchanged (`/withdrawal/*`).
- Base flow stays direct ERC20 transfer.
- CCTP flow stays `approve (if needed) -> depositForBurnWithHook -> burn-submitted`.
- Current validation and disable rules stay identical.
- Existing styling/classes remain unchanged unless explicitly requested.

## Verification Checklist (manual)
- Open Send flow: network fees render for all available networks.
- Base destination:
  - transfer tx opens Privy modal and submits.
  - status/UI updates match current behavior.
- Cross-chain destination:
  - quote fetch/update/expiry logic works.
  - approve shown only when allowance is insufficient.
  - burn tx hash is posted and polling continues.
- Insufficient balance and minimum amount guards work as before.
- Invalid destination address blocks confirm and shows validation message.
- Review screen errors clear appropriately; terminal errors persist.

## Execution Phases
1. **Extract pure utilities** from `WalletPanel` to `lib/withdraw.ts`.
2. **Extract side-effects** into hooks (`useBalance`, `useNetworkFeeEstimates`, `useWithdrawalQuote`, `useWithdrawalStatus`).
3. **Split UI by step** into components while preserving class names/markup.
4. **Stabilize + verify** using the checklist above and type check.

## Current progress
- Phase 1 started:
  - Added `lib/withdraw.ts` for shared pure helpers/constants.
  - `WalletPanel` now imports these helpers.
- Phase 2 started:
  - Added `lib/useWithdrawBalance.ts` and moved balance polling/loading there.
  - Added `lib/useNetworkFeeEstimates.ts` and moved fee-estimate fetching/retry there.
  - Added `lib/useWithdrawalQuote.ts` and moved quote fetch/expiry/auto-refresh there.
  - Added `lib/useWithdrawalStatus.ts` and moved withdrawal status polling there.
  - `WalletPanel` now consumes both hooks with unchanged UI/flow.
- Phase 3 started:
  - Extracted step UI components:
    - `components/withdraw/WithdrawStepNetwork.tsx`
    - `components/withdraw/WithdrawStepAmount.tsx`
    - `components/withdraw/WithdrawStepReview.tsx`
