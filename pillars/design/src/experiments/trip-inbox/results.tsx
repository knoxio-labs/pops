import { CheckCircle2, ChevronDown, Circle, CircleAlert, X } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pops/ui';

import { captureIcons } from '../trip-quick-capture/kinds';
import { InboxSource } from './source';

import type { InboxRow } from './model';

function InboxRowTrigger({
  row,
  open,
  select,
  layout,
}: {
  row: InboxRow;
  open: boolean;
  select: () => void;
  layout: 'inline' | 'dialog';
}) {
  const Icon = captureIcons[row.source?.kind ?? 'unclassified'];
  const StatusIcon = row.source ? Circle : CircleAlert;
  const ValidStatusIcon = row.organised ? CheckCircle2 : StatusIcon;
  const status = row.source ? 'To organise' : 'Source unavailable';
  return (
    <Button
      variant="ghost"
      aria-label={`Open ${row.label}`}
      aria-expanded={layout === 'inline' ? open : undefined}
      onClick={select}
      className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal rounded-none p-3 text-left font-normal focus-visible:ring-inset"
    >
      <Icon className="size-5 shrink-0 text-app-accent" />
      <span className="min-w-0 flex-1 break-words text-sm font-medium">{row.label}</span>
      <Badge variant="outline" className="shrink-0 gap-1 font-normal">
        <ValidStatusIcon className="size-3" />
        {row.organised ? 'Organised' : status}
      </Badge>
      {layout === 'inline' && (
        <ChevronDown className={`size-4 shrink-0 ${open ? 'rotate-180' : ''}`} />
      )}
    </Button>
  );
}

type ResultsProps = {
  rows: InboxRow[];
  selected: InboxRow | null;
  select: (id: string | null) => void;
  layout: 'inline' | 'dialog';
};

/** Keep the selected source visible in its row or a focused dialog using identical organisation controls. */
export function InboxResults({ rows, selected, select, layout }: ResultsProps) {
  const visible =
    selected && layout === 'inline' && !rows.some((row) => row.id === selected.id)
      ? [selected, ...rows]
      : rows;
  return (
    <>
      {!visible.length && <p className="py-6 text-sm text-muted-foreground">No matching items</p>}
      {visible.length > 0 && (
        <Card className="gap-0 divide-y divide-border overflow-hidden border-border py-0">
          {visible.map((row) => (
            <article key={row.id}>
              <InboxRowTrigger
                row={row}
                layout={layout}
                open={selected?.id === row.id}
                select={() => select(selected?.id === row.id ? null : row.id)}
              />
              {layout === 'inline' && selected?.id === row.id && (
                <div className="border-t border-border p-3">
                  <InboxSource key={row.id} row={selected} />
                </div>
              )}
            </article>
          ))}
        </Card>
      )}
      {layout === 'dialog' && (
        <Dialog
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open) select(null);
          }}
        >
          {selected && (
            <DialogContent className="max-h-full overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base">{selected.label}</DialogTitle>
                <DialogDescription>Captured source and linked trip items</DialogDescription>
              </DialogHeader>
              <InboxSource key={selected.id} row={selected} />
            </DialogContent>
          )}
        </Dialog>
      )}
      {layout === 'inline' && selected && (
        <Button variant="ghost" onClick={() => select(null)}>
          <X className="size-4" />
          Close item
        </Button>
      )}
    </>
  );
}
