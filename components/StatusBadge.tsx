import { PayoutStatus } from '@/types/payout';

interface StatusBadgeProps {
  status: PayoutStatus;
}

const statusConfig: Record<PayoutStatus, { text: string; className: string }> = {
  CREATED: {
    text: 'Ready to claim',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  PENDING_EMAIL: {
    text: 'Pending verification',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  PENDING_APPROVAL: {
    text: 'Awaiting approval',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  PAYING: {
    text: 'Processing payment',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  PAID: {
    text: 'Paid',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  EXPIRED: {
    text: 'Expired',
    className: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  },
  CANCELLED: {
    text: 'Cancelled',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
  FAILED: {
    text: 'Failed',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.FAILED;

  return (
    <span
      className={`inline-flex min-h-6 shrink-0 items-center justify-center whitespace-nowrap text-center px-3 py-0.5 rounded-full text-xs font-medium border leading-none ${config.className}`}
    >
      {config.text}
    </span>
  );
}
