/**
 * What the overview, in hand, sync and type arrived pages float over their
 * body: the toast dock, and the card a body shows when it failed to load.
 */
import { Button, Card } from '@pops/ui';

import type { ReactNode } from 'react';

/** Where a page's floating layer sits: bottom right, above the body. */
export function ToastDock({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute right-0 bottom-0 z-20 [&>*]:pointer-events-auto">
      {children}
    </div>
  );
}

/** A body that failed to load: what failed, that nothing changed, and Retry. */
export function LoadError({ title, detail }: { title: string; detail: string }) {
  return (
    <Card
      role="alert"
      className="mx-auto mt-6 w-full max-w-md items-center gap-3 px-6 py-8 text-center"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{detail}</p>
      <Button size="sm" variant="outline">
        Retry
      </Button>
    </Card>
  );
}
