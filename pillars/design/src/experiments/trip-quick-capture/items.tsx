import { ChevronDown, Paperclip, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import { CaptureEditor } from './editor';
import { captureIcons } from './kinds';
import { captureLabel } from './model';
import { captureVisitLabel } from './references';

import type { CapturedItem } from './model';

/** Compact source rows expand in place; identity stays stable across later enrichment. */
export function CaptureItems({
  items,
  change,
}: {
  items: CapturedItem[];
  change: (next: CapturedItem[]) => void;
}) {
  return (
    <section className="space-y-2" aria-label="Captured items">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        Captured <span className="text-sm font-normal text-foreground/70">{items.length}</span>
      </h2>
      {items.map((item) => (
        <CaptureRow
          key={item.id}
          item={item}
          change={(next) => change(items.map((record) => (record.id === item.id ? next : record)))}
          remove={() => change(items.filter((record) => record.id !== item.id))}
        />
      ))}
    </section>
  );
}

function CaptureRow({
  item,
  change,
  remove,
}: {
  item: CapturedItem;
  change: (next: CapturedItem) => void;
  remove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = captureIcons[item.kind ?? 'unclassified'];
  return (
    <article
      className="group space-y-2 rounded-xl border border-dashed border-foreground/25 bg-muted/60 p-3"
      aria-label={captureLabel(item)}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-app-accent text-app-accent-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <Button
          variant="ghost"
          aria-label={`Edit ${captureLabel(item)}`}
          aria-expanded={open}
          className="min-w-0 flex-1 justify-start px-1 text-left"
          onClick={() => setOpen(!open)}
        >
          <span className="min-w-0 flex-1 truncate font-medium">{captureLabel(item)}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove ${captureLabel(item)}`}
          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
          onClick={remove}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 pl-11 text-xs text-foreground/80">
        <span>{captureVisitLabel(item.visitId)}</span>
        {item.files.length > 0 && (
          <span className="flex items-center gap-1">
            <Paperclip className="size-3" aria-hidden />
            {item.files.map((file) => file.name).join(' · ')}
          </span>
        )}
      </div>
      {open && <CaptureEditor item={item} change={change} />}
    </article>
  );
}
