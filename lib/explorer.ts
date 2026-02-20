function isTestnetMode(): boolean {
  const raw = (process.env.NEXT_PUBLIC_CCTP_ENV ?? process.env.NEXT_PUBLIC_ENVIRONMENT ?? '').toLowerCase();
  return raw === 'testnet';
}

type ExplorerTxOptions = {
  forceBaseSepolia?: boolean;
};

export function getExplorerTxUrl(
  chain: string,
  txHash: string,
  options: ExplorerTxOptions = {}
): string {
  const normalized = chain.toLowerCase();

  if (normalized.includes('base')) {
    const baseHost =
      options.forceBaseSepolia || isTestnetMode() || normalized.includes('sepolia')
        ? 'https://sepolia.basescan.org/tx/'
        : 'https://basescan.org/tx/';
    return `${baseHost}${txHash}`;
  }
  if (normalized.includes('arbitrum')) {
    return `https://arbiscan.io/tx/${txHash}`;
  }
  if (normalized.includes('optimism')) {
    return `https://optimistic.etherscan.io/tx/${txHash}`;
  }
  if (normalized.includes('polygon')) {
    return `https://polygonscan.com/tx/${txHash}`;
  }
  if (normalized.includes('ethereum')) {
    return `https://etherscan.io/tx/${txHash}`;
  }
  return '';
}
