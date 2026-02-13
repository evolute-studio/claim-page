export function truncateAddress(address: string, prefix = 6, suffix = 4): string {
  const value = address?.trim?.() ?? '';
  if (!value) return '';
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}
