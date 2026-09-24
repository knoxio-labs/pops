/**
 * One item in the job: its mark, name and code, or for an item with no code
 * the suggested code one tap away. A box whose contents are not all in the
 * job offers to add them. Removing an item takes it out of this job only.
 */
import { Package, Pencil, Plus, Tag, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import { CodeField } from './code-field';
import { saveSuggestedCode } from './useSaveCode';

import type { LabelSubject } from './useLabelSubjects';
import type { CodeSaveResult } from './useSaveCode';

/** Props for {@link SelectionRow}. */
export interface SelectionRowProps {
  subject: LabelSubject;
  /** The box's contents that are not in the job yet. */
  contentsToAdd: LabelSubject[];
  saveCode: (subject: LabelSubject, code: string) => Promise<CodeSaveResult>;
  onAdd: (ids: string[]) => void;
  onRemove: (id: string) => void;
}

function Mark({ kind }: { kind: LabelSubject['kind'] }) {
  const Icon = kind === 'container' ? Package : Tag;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-app-accent/15 text-app-accent">
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

function MissingCodeLine({
  row,
  onType,
  onRefused,
}: {
  row: SelectionRowProps;
  onType: () => void;
  onRefused: (result: CodeSaveResult, attempted: string) => void;
}) {
  const { subject } = row;
  const suggestion = subject.suggestedCode;
  const [saving, setSaving] = useState(false);
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      No code
      {suggestion ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 font-mono text-xs"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            const result = await saveSuggestedCode(row.saveCode, subject, suggestion);
            setSaving(false);
            if (result.status !== 'saved') onRefused(result, suggestion);
          }}
        >
          Add {suggestion}
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        aria-label={`Type a code for ${subject.name}`}
        onClick={onType}
      >
        <Pencil className="size-3.5" aria-hidden />
      </Button>
    </span>
  );
}

function CodeArea({ row }: { row: SelectionRowProps }) {
  const { subject } = row;
  const [editing, setEditing] = useState<{ draft: string; result: CodeSaveResult | null } | null>(
    null
  );
  if (subject.code) {
    return <span className="font-mono text-xs font-semibold">{subject.code}</span>;
  }
  if (editing) {
    return (
      <CodeField
        itemName={subject.name}
        initial={editing.draft}
        initialResult={editing.result}
        onSave={async (code) => {
          const result = await row.saveCode(subject, code);
          if (result.status === 'saved') setEditing(null);
          return result;
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }
  return (
    <MissingCodeLine
      row={row}
      onType={() => setEditing({ draft: subject.suggestedCode ?? '', result: null })}
      onRefused={(result, attempted) => setEditing({ draft: attempted, result })}
    />
  );
}

/** One row of the selection list. */
export function SelectionRow(row: SelectionRowProps) {
  const { subject, contentsToAdd } = row;
  return (
    <li className="flex items-start gap-3 py-2">
      <Mark kind={subject.kind} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex min-w-0 items-baseline gap-1.5 text-sm font-medium">
          <span className="truncate" title={subject.name}>
            {subject.name}
          </span>
          {subject.quantity > 1 ? (
            <span className="shrink-0 text-xs text-muted-foreground">×{subject.quantity}</span>
          ) : null}
        </p>
        <CodeArea row={row} />
        {contentsToAdd.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            className="-ml-2 h-7 px-2 text-xs"
            prefix={<Plus className="size-3.5" aria-hidden />}
            onClick={() => row.onAdd(contentsToAdd.map((held) => held.id))}
          >
            Add {contentsToAdd.length} inside
          </Button>
        ) : null}
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="-my-1.5 shrink-0 text-muted-foreground"
        aria-label={`Remove ${subject.name}`}
        onClick={() => row.onRemove(subject.id)}
      >
        <X className="size-4" />
      </Button>
    </li>
  );
}
