/**
 * The scrolling panel the connections, fixtures, reports and settings pages
 * put their lists in: bordered, with an optional fixed header row and footer.
 */
import { cn } from '@pops/ui';

import type { ReactNode } from 'react';

/** A bordered panel whose body scrolls, with an optional fixed header row and footer. */
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
}) {
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
