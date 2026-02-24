import type { PayoutStatus } from '@/types/payout';

export type PayoutStatusUi = {
  badgeLabel: string;
  badgeClassName: string;
  pillContainerClassName: string;
  pillTextClassName: string;
  pillDotClassName: string;
};

const SUCCESS_TONE = {
  badgeClassName: 'bg-[rgba(16,185,129,0.16)] text-[#9ee6cb] border-[rgba(16,185,129,0.34)]',
  pillContainerClassName: 'border-[rgba(16,185,129,0.34)] bg-[rgba(16,185,129,0.12)]',
  pillTextClassName: 'text-[#9ee6cb]',
  pillDotClassName: 'bg-[#9ee6cb]',
};

const WARNING_TONE = {
  badgeClassName: 'bg-[rgba(245,158,11,0.16)] text-[#f6d88f] border-[rgba(245,158,11,0.34)]',
  pillContainerClassName: 'border-[rgba(245,158,11,0.34)] bg-[rgba(245,158,11,0.12)]',
  pillTextClassName: 'text-[#f6d88f]',
  pillDotClassName: 'bg-[#f6d88f]',
};

const INFO_TONE = {
  badgeClassName: 'bg-[rgba(14,165,233,0.16)] text-[#a9ddf4] border-[rgba(14,165,233,0.34)]',
  pillContainerClassName: 'border-[rgba(14,165,233,0.34)] bg-[rgba(14,165,233,0.12)]',
  pillTextClassName: 'text-[#a9ddf4]',
  pillDotClassName: 'bg-[#a9ddf4]',
};

const DANGER_TONE = {
  badgeClassName: 'bg-[rgba(244,63,94,0.16)] text-[#f4b3c3] border-[rgba(244,63,94,0.34)]',
  pillContainerClassName: 'border-[rgba(244,63,94,0.34)] bg-[rgba(244,63,94,0.12)]',
  pillTextClassName: 'text-[#f4b3c3]',
  pillDotClassName: 'bg-[#f4b3c3]',
};

const NEUTRAL_TONE = {
  badgeClassName: 'bg-white/5 text-gray-300 border-white/15',
  pillContainerClassName: 'border-white/15 bg-white/[0.06]',
  pillTextClassName: 'text-gray-300',
  pillDotClassName: 'bg-gray-300',
};

const STATUS_UI: Record<PayoutStatus, PayoutStatusUi> = {
  CREATED: {
    badgeLabel: 'Ready to claim',
    ...SUCCESS_TONE,
  },
  PENDING_EMAIL: {
    badgeLabel: 'Pending verification',
    ...WARNING_TONE,
  },
  PENDING_APPROVAL: {
    badgeLabel: 'Awaiting approval',
    ...WARNING_TONE,
  },
  PAYING: {
    badgeLabel: 'Processing payment',
    ...INFO_TONE,
  },
  PAID: {
    badgeLabel: 'Paid',
    ...SUCCESS_TONE,
  },
  EXPIRED: {
    badgeLabel: 'Expired',
    ...NEUTRAL_TONE,
  },
  CANCELLED: {
    badgeLabel: 'Cancelled',
    ...DANGER_TONE,
  },
  FAILED: {
    badgeLabel: 'Failed',
    ...DANGER_TONE,
  },
};

export function getPayoutStatusUi(status: PayoutStatus): PayoutStatusUi {
  return STATUS_UI[status] ?? STATUS_UI.FAILED;
}

