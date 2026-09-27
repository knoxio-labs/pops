import { FileUp, Plus, Rows3 } from 'lucide-react';

import { Button, Card } from '@pops/ui';

import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { ShortcutHint } from '../../foundation/shortcuts/shortcut-hint.js';

import type { ReactElement, ReactNode } from 'react';

function Step({
  number,
  title,
  detail,
  children,
}: {
  number: number;
  title: string;
  detail: string;
  children: ReactNode;
}): ReactElement {
  return (
    <li className="flex gap-4 py-5 first:pt-0 last:pb-0">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-sm font-semibold text-app-accent">
        {number}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    </li>
  );
}

type Go = (path: string) => () => void;

function AddWhatYouOwn({ go }: { go: Go }): ReactElement {
  return (
    <Step
      number={2}
      title="Add what you own"
      detail="One at a time, many rows at once, or from a spreadsheet."
    >
      <Button
        size="sm"
        variant="outline"
        onClick={go('/inventory/items/new')}
        prefix={<Plus className="size-4" aria-hidden />}
        suffix={<ShortcutHint id="new-item" />}
      >
        New item
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={go('/inventory/items/bulk-new')}
        prefix={<Rows3 className="size-4" aria-hidden />}
        suffix={<ShortcutHint id="bulk-entry" />}
      >
        Bulk entry
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={go('/inventory/import')}
        prefix={<FileUp className="size-4" aria-hidden />}
      >
        Import CSV
      </Button>
    </Step>
  );
}

function LabelThem(): ReactElement {
  return (
    <Step
      number={3}
      title="Label what you will look for"
      detail="A printed code on a box finds it from the search box without opening it."
    >
      <Button
        size="sm"
        variant="outline"
        disabled
        prefix={<INVENTORY_ICONS.label className="size-4" aria-hidden />}
      >
        Print labels
      </Button>
      <span className="self-center text-xs text-muted-foreground">
        Available once an item exists.
      </span>
    </Step>
  );
}

/** Renders the three actions shown before the first inventory item exists. */
export function FirstRunCard({ onNavigate }: { onNavigate: (path: string) => void }): ReactElement {
  const go: Go = (path) => () => onNavigate(path);
  return (
    <Card className="mx-auto w-full max-w-2xl px-6 py-6">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold">Nothing is tracked yet</h2>
        <p className="text-sm text-muted-foreground">
          Three steps get the house in. Each can be done later, in any order.
        </p>
      </div>
      <ol className="divide-y">
        <Step
          number={1}
          title="Add your places"
          detail="Rooms first, then the cupboards and shelves inside them. Items and boxes go in these."
        >
          <Button
            size="sm"
            onClick={go('/inventory/locations')}
            prefix={<INVENTORY_ICONS.location className="size-4" aria-hidden />}
          >
            Add a place
          </Button>
        </Step>
        <AddWhatYouOwn go={go} />
        <LabelThem />
      </ol>
    </Card>
  );
}
