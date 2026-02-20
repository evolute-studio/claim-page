export function truncateAddress(address: string, prefix = 6, suffix = 4): string {
  const value = address?.trim?.() ?? '';
  if (!value) return '';
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}

export function maskEmail(email: string): string {
  const value = email?.trim?.() ?? '';
  if (!value) return 'hidden recipient';
  if (value.includes('*')) return value;

  const atIndex = value.indexOf('@');
  if (atIndex <= 0 || atIndex >= value.length - 1) return 'hidden recipient';

  const localPart = value.slice(0, atIndex);
  const domainPart = value.slice(atIndex + 1);
  if (!domainPart) return 'hidden recipient';

  let maskedLocalPart = '*';
  if (localPart.length === 2) {
    maskedLocalPart = `${localPart[0]}*`;
  } else if (localPart.length >= 3) {
    maskedLocalPart = `${localPart[0]}${'*'.repeat(localPart.length - 2)}${localPart[localPart.length - 1]}`;
  }

  return `${maskedLocalPart}@${domainPart}`;
}
