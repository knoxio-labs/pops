import { type PendingImport } from '@/fixtures/pending-imports';
import { PendingImportList } from '@/kit/pending-import-card';

import { Separator } from '@pops/ui';

/**
 * What was started and not finished, ahead of starting another. It is a
 * section and not a modal because the modal only ever knew about the one
 * draft in this browser; with drafts on the server and a bank feeding some
 * of them, there can be several, and a person picking an account below
 * should see that one of them already has that account's rows waiting.
 */
export function ContinuePending({ items }: { items: PendingImport[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <div>
        <h2 className="text-sm font-semibold">Continue where you left off</h2>
        <p className="text-xs text-muted-foreground">
          Imports you or a bank feed started. Picking one opens it at the step it stopped on.
        </p>
      </div>
      <PendingImportList items={items} compact />
    </section>
  );
}

export function StartNewHeading({ hasPending }: { hasPending: boolean }) {
  if (!hasPending) return null;
  return (
    <div className="flex items-center gap-3 pt-2">
      <Separator className="flex-1" />
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Or start a new import
      </span>
      <Separator className="flex-1" />
    </div>
  );
}
