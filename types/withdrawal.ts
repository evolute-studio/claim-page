export type DestinationChain =
  | 'base'
  | 'ethereum'
  | 'arbitrum'
  | 'optimism'
  | 'polygon'
  | 'avalanche'
  | 'linea';

export type ForwardFeeLevel = 'low' | 'med' | 'high';
export type WithdrawalSponsorMode = 'none' | 'auto' | 'required';

export type WithdrawalStatus =
  | 'CREATED'
  | 'BURN_SUBMITTED'
  | 'FORWARDING_PENDING'
  | 'MINTED'
  | 'FAILED'
  | 'EXPIRED';

export interface WithdrawalQuoteResponse {
  quote_id: string;
  source_chain: 'base';
  source_domain_id: number;
  dest_chain: DestinationChain;
  dest_domain_id: number;
  transfer_amount_usdc_minor: number;
  finality_threshold: number;
  forward_fee_level: ForwardFeeLevel;
  fee_protocol_usdc_minor: number;
  fee_forward_usdc_minor: number;
  max_fee_usdc_minor: number;
  total_burn_usdc_minor: number;
  expires_at: number;
}

export interface CreateWithdrawalResponse {
  withdrawal_id: string;
  status: WithdrawalStatus;
  sponsor_mode?: WithdrawalSponsorMode;
  sponsor_reason?: string | null;
}

export interface BurnSubmittedResponse {
  status: WithdrawalStatus;
}

export interface CancelWithdrawalResponse {
  status: string;
  reservation_released?: boolean;
  message?: string;
}

export interface WithdrawalStatusResponse {
  id: string;
  status: WithdrawalStatus;
  burn_tx_hash?: string | null;
  forward_tx_hash?: string | null;
  failure_reason?: string | null;
}

export interface WithdrawalListItem {
  id: string;
  status: WithdrawalStatus;
  dest_chain: DestinationChain;
  dest_address?: string | null;
  transfer_amount_usdc_minor: number;
  total_burn_usdc_minor?: number | null;
  max_fee_usdc_minor?: number | null;
  fee_forward_usdc_minor?: number | null;
  fee_protocol_usdc_minor?: number | null;
  burn_tx_hash?: string | null;
  forward_tx_hash?: string | null;
  created_at?: number | null;
  updated_at?: number | null;
  burn_tx_at?: number | null;
  forward_tx_at?: number | null;
  failure_reason?: string | null;
}

export interface WithdrawalListResponse {
  withdrawals: WithdrawalListItem[];
  next_cursor?: string | null;
}
