import { type ReactNode } from 'react';

import { Button } from '@pops/ui';

/** A small icon-only action inside a `TextInput` suffix — routes through `Button` for its built-in 44px touch target. */
export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={onClick}
      className="text-muted-foreground"
    >
      {children}
    </Button>
  );
}
