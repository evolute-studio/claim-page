import { PayoutStatus } from '@/types/payout';

interface StatusBadgeProps {
  status: PayoutStatus;
}

const statusConfig: Record<PayoutStatus, { text: string; className: string }> = {
  CREATED: {
    text: 'Ready to claim',
    className: 'bg-[rgba(16,185,129,0.16)] text-[#9ee6cb] border-[rgba(16,185,129,0.34)]',
  },
  PENDING_EMAIL: {
    text: 'Pending verification',
    className: 'bg-[rgba(245,158,11,0.16)] text-[#f6d88f] border-[rgba(245,158,11,0.34)]',
  },
  PENDING_APPROVAL: {
    text: 'Awaiting approval',
    className: 'bg-[rgba(245,158,11,0.16)] text-[#f6d88f] border-[rgba(245,158,11,0.34)]',
  },
  PAYING: {
    text: 'Processing payment',
    className: 'bg-[rgba(14,165,233,0.16)] text-[#a9ddf4] border-[rgba(14,165,233,0.34)]',
  },
  PAID: {
    text: 'Paid',
    className: 'bg-[rgba(16,185,129,0.16)] text-[#9ee6cb] border-[rgba(16,185,129,0.34)]',
  },
  EXPIRED: {
    text: 'Expired',
    className: 'bg-white/5 text-gray-300 border-white/15',
  },
  CANCELLED: {
    text: 'Cancelled',
    className: 'bg-[rgba(244,63,94,0.16)] text-[#f4b3c3] border-[rgba(244,63,94,0.34)]',
  },
  FAILED: {
    text: 'Failed',
    className: 'bg-[rgba(244,63,94,0.16)] text-[#f4b3c3] border-[rgba(244,63,94,0.34)]',
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
