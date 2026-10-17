import type { ReactElement } from 'react';

/** Props for the accessible cracked-glass packaging symbol. */
export interface FragileIconProps {
  className?: string;
  size?: number | string;
}

/** Renders the cracked-glass packaging symbol with an accessible name. */
export function FragileIcon({ className, size = 24 }: FragileIconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Fragile: cracked glass"
    >
      <path d="M18 5h28l3 18c2 11-6 20-17 20s-19-9-17-20L18 5Z" />
      <path d="m35 5-8 13 10 7-9 10 4 8M32 43v16M21 59h22" />
    </svg>
  );
}
