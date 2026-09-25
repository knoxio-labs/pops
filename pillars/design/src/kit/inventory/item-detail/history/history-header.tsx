/**
 * The history page's header: back to the item, then the title in the POPS
 * page header shape.
 */
import { ArrowLeft } from 'lucide-react';

import { Button } from '@pops/ui';

import { AccentTile, INVENTORY_ICONS } from '../../foundation';

/** The header. */
export function HistoryHeader({ itemName, total }: { itemName: string; total: number }) {
  const Icon = INVENTORY_ICONS.history;
  return (
    <header className="flex shrink-0 flex-col gap-1">
      <div className="flex h-8 items-center">
        <Button
          variant="link"
          size="sm"
          className="h-6 gap-1 px-0 text-xs text-muted-foreground"
          prefix={<ArrowLeft className="size-3.5" aria-hidden />}
        >
          {itemName}
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <AccentTile icon={Icon} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight md:text-3xl">
            History of {itemName}
          </h1>
          <p className="text-xs text-muted-foreground">
            {total === 1 ? '1 event' : `${total} events`}, newest first. Undo writes a new event;
            nothing is erased.
          </p>
        </div>
      </div>
    </header>
  );
}
