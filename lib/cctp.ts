import { base, baseSepolia } from 'viem/chains';
import type { Chain } from 'viem/chains';
import { CHAIN_OPTIONS } from '@/lib/chains';
import type { DestinationChain } from '@/types/withdrawal';

type DestinationConfig = {
  key: DestinationChain;
  label: string;
  domainId: number;
  explorerTxBase: string;
};

const MAINNET_DESTINATION_CHAINS: DestinationConfig[] = [
  { key: 'base', label: 'Base', domainId: 6, explorerTxBase: 'https://basescan.org/tx/' },
  { key: 'ethereum', label: 'Ethereum', domainId: 0, explorerTxBase: 'https://etherscan.io/tx/' },
  { key: 'arbitrum', label: 'Arbitrum', domainId: 3, explorerTxBase: 'https://arbiscan.io/tx/' },
  { key: 'optimism', label: 'Optimism', domainId: 2, explorerTxBase: 'https://optimistic.etherscan.io/tx/' },
  { key: 'polygon', label: 'Polygon', domainId: 7, explorerTxBase: 'https://polygonscan.com/tx/' },
  { key: 'avalanche', label: 'Avalanche', domainId: 1, explorerTxBase: 'https://snowtrace.io/tx/' },
  { key: 'linea', label: 'Linea', domainId: 11, explorerTxBase: 'https://lineascan.build/tx/' },
];

const TESTNET_DESTINATION_CHAINS: DestinationConfig[] = [
  { key: 'base', label: 'Base Sepolia', domainId: 6, explorerTxBase: 'https://sepolia.basescan.org/tx/' },
  { key: 'ethereum', label: 'Ethereum Sepolia', domainId: 0, explorerTxBase: 'https://sepolia.etherscan.io/tx/' },
  { key: 'arbitrum', label: 'Arbitrum Sepolia', domainId: 3, explorerTxBase: 'https://sepolia.arbiscan.io/tx/' },
  { key: 'optimism', label: 'OP Sepolia', domainId: 2, explorerTxBase: 'https://sepolia-optimistic.etherscan.io/tx/' },
  { key: 'polygon', label: 'Polygon Amoy', domainId: 7, explorerTxBase: 'https://amoy.polygonscan.com/tx/' },
  { key: 'avalanche', label: 'Avalanche Fuji', domainId: 1, explorerTxBase: 'https://testnet.snowtrace.io/tx/' },
  { key: 'linea', label: 'Linea Sepolia', domainId: 11, explorerTxBase: 'https://sepolia.lineascan.build/tx/' },
];

export const SOURCE_DOMAIN_ID = 6;

type CctpEnv = 'mainnet' | 'testnet';

function getCctpEnv(): CctpEnv {
  const raw =
    process.env.NEXT_PUBLIC_CCTP_ENV ??
    process.env.NEXT_PUBLIC_ENVIRONMENT ??
    '';
  return raw.toLowerCase() === 'testnet' ? 'testnet' : 'mainnet';
}

export function getSourceChain(): Chain {
  const explicit = (process.env.NEXT_PUBLIC_CCTP_SOURCE_CHAIN ?? '').toLowerCase();
  if (explicit) {
    return explicit === 'basesepolia' || explicit === 'base-sepolia' ? baseSepolia : base;
  }
  return getCctpEnv() === 'testnet' ? baseSepolia : base;
}

export function getDestinationChains(sourceChain: Chain): DestinationConfig[] {
  return sourceChain.id === baseSepolia.id ? TESTNET_DESTINATION_CHAINS : MAINNET_DESTINATION_CHAINS;
}

function isHexAddress(value?: string | null): boolean {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isHexData(value?: string | null): boolean {
  return !!value && /^0x[0-9a-fA-F]*$/.test(value);
}

function getDefaultUsdcAddress(sourceChainId: number): string | null {
  const match = CHAIN_OPTIONS.find((option) => option.id === sourceChainId);
  return match?.usdcAddress ?? null;
}

export function getCctpConfig() {
  const sourceChain = getSourceChain();
  const envMode = getCctpEnv();
  const usdcAddress =
    (envMode === 'testnet'
      ? process.env.NEXT_PUBLIC_CCTP_USDC_ADDRESS_TESTNET
      : process.env.NEXT_PUBLIC_CCTP_USDC_ADDRESS_MAINNET) ??
    process.env.NEXT_PUBLIC_CCTP_USDC_ADDRESS ??
    getDefaultUsdcAddress(sourceChain.id);
  const tokenMessengerAddress =
    (envMode === 'testnet'
      ? process.env.NEXT_PUBLIC_CCTP_TOKEN_MESSENGER_V2_ADDRESS_TESTNET
      : process.env.NEXT_PUBLIC_CCTP_TOKEN_MESSENGER_V2_ADDRESS_MAINNET) ??
    process.env.NEXT_PUBLIC_CCTP_TOKEN_MESSENGER_V2_ADDRESS ??
    '';
  const forwardingHookData =
    (envMode === 'testnet'
      ? process.env.NEXT_PUBLIC_CCTP_FORWARDING_HOOK_DATA_TESTNET
      : process.env.NEXT_PUBLIC_CCTP_FORWARDING_HOOK_DATA_MAINNET) ??
    process.env.NEXT_PUBLIC_CCTP_FORWARDING_HOOK_DATA ??
    '';

  const errors: string[] = [];
  if (!usdcAddress) {
    errors.push('Missing USDC address for source chain');
  } else if (!isHexAddress(usdcAddress)) {
    errors.push('USDC address must be a 0x address');
  }
  if (!tokenMessengerAddress) {
    errors.push('Missing TokenMessengerV2 address');
  } else if (!isHexAddress(tokenMessengerAddress)) {
    errors.push('TokenMessengerV2 address must be a 0x address');
  }
  if (!forwardingHookData) {
    errors.push('Missing Forwarding hookData');
  } else if (!isHexData(forwardingHookData)) {
    errors.push('Forwarding hookData must be hex data');
  }

  return {
    sourceChain,
    sourceDomainId: SOURCE_DOMAIN_ID,
    usdcAddress: usdcAddress ?? '',
    tokenMessengerAddress,
    forwardingHookData,
    errors,
  };
}

export function getDestinationConfig(
  chain: DestinationChain,
  sourceChain: Chain
): DestinationConfig | undefined {
  return getDestinationChains(sourceChain).find((item) => item.key === chain);
}
