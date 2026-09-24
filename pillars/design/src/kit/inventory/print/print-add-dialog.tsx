/**
 * Adding to the job: search the catalogue and add an item, or a box together
 * with everything in it. Items already in the job show as added.
 */
import { Check, Package, Tag } from 'lucide-react';
import { useState } from 'react';

import { Button, SearchPickerDialog } from '@pops/ui';

import type { ReactElement } from 'react';

import type { PrintSubject } from './print-subject';

/** One pickable item, with what it contains when it is a box. */
export interface PrintCatalogueEntry {
  subject: PrintSubject;
  contents: PrintSubject[];
}

/** Props for {@link PrintAddDialog}. */
export interface PrintAddDialogProps {
  trigger: ReactElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogue: PrintCatalogueEntry[];
  selectedIds: ReadonlySet<string>;
  onAdd: (subjects: PrintSubject[]) => void;
  initialSearch?: string;
}

function matches(entry: PrintCatalogueEntry, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const { name, code } = entry.subject;
  return name.toLowerCase().includes(needle) || (code?.toLowerCase().includes(needle) ?? false);
}

function Result({
  entry,
  added,
  onAdd,
}: {
  entry: PrintCatalogueEntry;
  added: boolean;
  onAdd: (subjects: PrintSubject[]) => void;
}) {
  const { subject, contents } = entry;
  const Icon = subject.kind === 'container' ? Package : Tag;
  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
      <Icon className="size-4 shrink-0 text-app-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{subject.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{subject.code ?? 'No code'}</span>
          {subject.place ? ` · ${subject.place}` : ''}
        </p>
      </div>
      {added ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3.5" aria-hidden />
          Added
        </span>
      ) : (
        <div className="flex shrink-0 gap-1">
          {contents.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => onAdd([subject, ...contents])}>
              With {contents.length} inside
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => onAdd([subject])}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

/** The search dialog that adds items, or a box with its contents, to the job. */
export function PrintAddDialog(props: PrintAddDialogProps) {
  const [search, setSearch] = useState(props.initialSearch ?? '');
  const results = props.catalogue.filter((entry) => matches(entry, search));
  return (
    <SearchPickerDialog
      trigger={props.trigger}
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Add to labels"
      searchPlaceholder="Name or code"
      search={search}
      onSearchChange={setSearch}
      isLoading={false}
      results={results}
      getResultKey={(entry) => entry.subject.id}
      minChars={0}
      maxResultsHeight="max-h-80"
      emptyMessage="No items match"
      renderResult={(entry) => (
        <Result entry={entry} added={props.selectedIds.has(entry.subject.id)} onAdd={props.onAdd} />
      )}
    />
  );
}
