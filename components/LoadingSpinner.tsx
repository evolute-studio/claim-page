interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizePx = {
  sm: 16,
  md: 30,
  lg: 46,
};

export function LoadingSpinner({ size = 'md' }: LoadingSpinnerProps) {
  const px = sizePx[size];
  const strokeWidth = size === 'sm' ? 7 : size === 'md' ? 6 : 5;

  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full animate-spin"
        role="presentation"
      >
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={strokeWidth}
        />
        <path
          d="M50 8a42 42 0 0 1 42 42"
          fill="none"
          stroke="rgba(255,255,255,0.96)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
      <span className="pointer-events-none absolute inset-[36%] rounded-full bg-white/25 blur-[1.5px]" />
    </span>
  );
}
