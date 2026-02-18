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
  id?: string;
  claim_token?: string;
  payout_id?: string;
  tournament_name?: string;
  asset: string;
  chain: string;
  amount_minor_units: number;
  amount_formatted: string;
  status: PayoutStatus;
  expires_at: number;
  created_at?: number;
  updated_at?: number;
  claimed_at?: number;
  paid_at?: number;
  tx_hash?: string;
  failure_reason?: string;
  recipient_email: string;
  rank?: number;
}

export interface ConfirmResponse {
  payout_id: string;
  status: PayoutStatus;
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

export interface PayoutListResponse {
  payouts: PayoutPreview[];
  next_cursor?: string | null;
}
