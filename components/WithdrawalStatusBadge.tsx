import type { WithdrawalStatus } from '@/types/withdrawal';

interface WithdrawalStatusBadgeProps {
  status: WithdrawalStatus;
}

const statusConfig: Record<WithdrawalStatus, { text: string; className: string }> = {
  CREATED: {
    text: 'Created',
    className: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  },
  BURN_SUBMITTED: {
    text: 'Burn submitted',
    className: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  FORWARDING_PENDING: {
    text: 'Forwarding',
    className: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  },
  MINTED: {
    text: 'Completed',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  FAILED: {
    text: 'Failed',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
  EXPIRED: {
    text: 'Expired',
    className: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
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
