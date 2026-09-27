import type { ReactElement, ReactNode } from 'react';

/** Props for a labelled section inside a sync detail sheet. */
export interface SheetSectionProps {
  title: string;
  children: ReactNode;
}

/** Renders the shared labelled section treatment used by sync detail sheets. */
export function SheetSection({ title, children }: SheetSectionProps): ReactElement {
  return (
    <section className="space-y-2">
      <h3 className="text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
