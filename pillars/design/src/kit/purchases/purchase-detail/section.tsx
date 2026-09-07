import { useId } from 'react';

import type { ReactNode } from 'react';

/** One labelled section of the order-detail page — a heading plus its body. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-base font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}
