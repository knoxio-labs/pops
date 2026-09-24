/**
 * The side panel listing what the job prints. It opens on whatever the page
 * was entered with (one item, a box and its contents, a handful chosen from
 * the list), and items can be added or taken out here without leaving it.
 */
import { Plus, Tags } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import { SelectionRow } from './selection-row';
import { saveSuggestedCode } from './useSaveCode';

import type { ReactNode } from 'react';

import type { LabelSubject } from './useLabelSubjects';
import type { CodeSaveResult } from './useSaveCode';

/** Props for {@link SelectionPanel}. */
export interface SelectionPanelProps {
  subjects: LabelSubject[];
  contents: ReadonlyMap<string, LabelSubject[]>;
  /** Ids the page was opened with that are not live items. */
  missing: string[];
  saveCode: (subject: LabelSubject, code: string) => Promise<CodeSaveResult>;
  addControl: ReactNode;
  onOpenAdd: () => void;
  onAdd: (ids: string[]) => void;
  onRemove: (id: string) => void;
}

function MissingCodes({ props }: { props: SelectionPanelProps }) {
  const uncoded = props.subjects.filter((subject) => subject.code === null);
  const suggested = uncoded.filter((subject) => subject.suggestedCode !== null);
  const [saving, setSaving] = useState(false);
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
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            for (const subject of suggested) {
              if (subject.suggestedCode) {
                await saveSuggestedCode(props.saveCode, subject, subject.suggestedCode);
              }
            }
            setSaving(false);
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

function source(subjects: LabelSubject[]): string {
  const [first] = subjects;
  if (!first) return 'Choose what to label';
  if (subjects.length === 1) return first.name;
  return `${first.name} and ${subjects.length - 1} more`;
}

/** The job's items, with code repair inline and add and remove. */
export function SelectionPanel(props: SelectionPanelProps) {
  const { subjects, contents, missing } = props;
  const inJob = new Set(subjects.map((subject) => subject.id));
  const count = subjects.length;
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{count === 1 ? '1 item' : `${count} items`}</h2>
          <p className="truncate text-xs text-muted-foreground">{source(subjects)}</p>
        </div>
        {props.addControl}
      </div>
      {missing.length > 0 ? (
        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs" role="status">
          {missing.length === 1 ? '1 item was' : `${missing.length} items were`} not found. It may
          have been deleted or discarded.
        </p>
      ) : null}
      <MissingCodes props={props} />
      {count === 0 ? (
        <EmptySelection onAdd={props.onOpenAdd} />
      ) : (
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto" aria-label="Items to print">
          {subjects.map((subject) => (
            <SelectionRow
              key={subject.id}
              subject={subject}
              contentsToAdd={(contents.get(subject.id) ?? []).filter((held) => !inJob.has(held.id))}
              saveCode={props.saveCode}
              onAdd={props.onAdd}
              onRemove={props.onRemove}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
