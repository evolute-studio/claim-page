import type { WithdrawalStatus } from '@/types/withdrawal';

interface WithdrawalStatusBadgeProps {
  status: WithdrawalStatus;
}

const statusConfig: Record<WithdrawalStatus, { text: string; className: string }> = {
  CREATED: {
    text: 'Created',
    className: 'bg-white/5 text-gray-300 border-white/15',
  },
  BURN_SUBMITTED: {
    text: 'Burn submitted',
    className: 'bg-[rgba(14,165,233,0.16)] text-[#a9ddf4] border-[rgba(14,165,233,0.34)]',
  },
  FORWARDING_PENDING: {
    text: 'Forwarding',
    className: 'bg-[rgba(245,158,11,0.16)] text-[#f6d88f] border-[rgba(245,158,11,0.34)]',
  },
  MINTED: {
    text: 'Completed',
    className: 'bg-[rgba(16,185,129,0.16)] text-[#9ee6cb] border-[rgba(16,185,129,0.34)]',
  },
  FAILED: {
    text: 'Failed',
    className: 'bg-[rgba(244,63,94,0.16)] text-[#f4b3c3] border-[rgba(244,63,94,0.34)]',
  },
  EXPIRED: {
    text: 'Expired',
    className: 'bg-white/5 text-gray-300 border-white/15',
  },
};

export function WithdrawalStatusBadge({ status }: WithdrawalStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.FAILED;

  return (
    <span
      className={`inline-flex min-h-6 shrink-0 items-center justify-center whitespace-nowrap text-center px-3 py-0.5 rounded-full text-xs font-medium border leading-none ${config.className}`}
    >
      {config.text}
    </span>
  );
}
