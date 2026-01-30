export type PayoutStatus =
  | 'CREATED'
  | 'PENDING_EMAIL'
  | 'PENDING_APPROVAL'
  | 'PAYING'
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface PayoutPreview {
  asset: string;
  chain: string;
  amount_minor_units: number;
  amount_formatted: string;
  status: PayoutStatus;
  expires_at: number;
  recipient_email: string;
  rank?: number;
}

export interface ConfirmResponse {
  payout_id: string;
  status: string;
  message: string;
}

export interface StatusResponse {
  payout_id: string;
  status: PayoutStatus;
  recipient_address?: string;
  tx_hash?: string;
  claimed_at?: number;
  paid_at?: number;
}
