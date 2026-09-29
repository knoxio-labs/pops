import { cn } from '@pops/ui';

import type { ReactElement, ReactNode } from 'react';

/** Renders a bordered scrolling list panel with optional fixed header and footer. */
export function ScrollPanel({
  header,
  footer,
  children,
  className,
  label,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  label?: string;
}): ReactElement {
  return (
    <section
      aria-label={label}
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card',
        className
      )}
    >
      {header}
      <div className="relative min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer}
    </section>
  );
}
