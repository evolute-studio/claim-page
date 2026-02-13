import { HandCoins } from 'lucide-react';

interface CoinIconProps {
  className?: string;
}

export function CoinIcon({ className }: CoinIconProps) {
  return (
    <HandCoins
      className={`h-4 w-4 ${className ?? ''}`.trim()}
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}
