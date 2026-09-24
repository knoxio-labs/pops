/**
 * The side panel listing what the job prints. It opens on whatever the page
 * was entered with (one item, a box and its contents, a handful chosen from a
 * list), and items can be added or taken out here without leaving the page.
 */
import { Plus, Tags } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import { PrintSelectionRow } from './print-selection-row';

import type { ReactNode } from 'react';

import type { TakenCode } from './print-code-field';
import type { PrintJob } from './use-print-job';

/** A code field the panel opens with, for reviewing that state. */
export interface PrintEditSeed {
  id: string;
  draft?: string;
  taken?: boolean;
}

/** Props for {@link PrintSelection}. */
export interface PrintSelectionProps {
  job: PrintJob;
  /** How the page was entered, e.g. "Kitchen 12 and its contents". */
  source: string;
  lookup: (code: string) => TakenCode | null;
  /** The add control in the panel header; it owns the picker dialog. */
  addControl: ReactNode;
  /** Opens the same picker from the empty state. */
  onAdd: () => void;
  editSeed?: PrintEditSeed;
}

function MissingCodes({ job }: { job: PrintJob }) {
  const { uncoded } = job;
  const suggested = uncoded.filter((subject) => subject.suggestedCode !== null);
  if (uncoded.length === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/60 px-3 py-2 text-xs" role="status">
      <p className="min-w-0 flex-1">
        {uncoded.length === 1 ? '1 item needs' : `${uncoded.length} items need`} a code before
        printing.
      </p>
      {suggested.length > 0 ? (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => {
            for (const subject of suggested) {
              if (subject.suggestedCode) job.setCode(subject.id, subject.suggestedCode);
            }
          }}
        >
          Add {suggested.length === 1 ? 'code' : `${suggested.length} codes`}
        </Button>
      ) : null}
    </div>
  );
}

function EmptySelection({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
      <Tags className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">Nothing to print</p>
      <Button size="sm" onClick={onAdd} prefix={<Plus className="size-4" aria-hidden />}>
        Add items
      </Button>
    </div>
  );
}

/** The job's items, with code repair inline and add and remove. */
export function PrintSelection({
  job,
  source,
  lookup,
  addControl,
  onAdd,
  editSeed,
}: PrintSelectionProps) {
  const [editingId, setEditingId] = useState<string | null>(editSeed?.id ?? null);
  const count = job.subjects.length;
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{count === 1 ? '1 item' : `${count} items`}</h2>
          <p className="truncate text-xs text-muted-foreground" title={source}>
            {source}
          </p>
        </div>
        {addControl}
      </div>
      <MissingCodes job={job} />
      {count === 0 ? (
        <EmptySelection onAdd={onAdd} />
      ) : (
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto" aria-label="Items to print">
          {job.subjects.map((subject) => (
            <PrintSelectionRow
              key={subject.id}
              subject={subject}
              editing={editingId === subject.id}
              editingDraft={editSeed?.id === subject.id ? editSeed.draft : undefined}
              editingTaken={editSeed?.id === subject.id ? editSeed.taken : undefined}
              lookup={lookup}
              onEdit={setEditingId}
              onSetCode={job.setCode}
              onRemove={job.remove}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
