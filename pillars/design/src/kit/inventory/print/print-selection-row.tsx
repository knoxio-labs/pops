/**
 * One item in the job: its mark, name and code, or for an uncoded item the
 * suggested code one click away. Removing it takes it out of this job only.
 */
import { Package, Pencil, Tag, X } from 'lucide-react';

import { Button } from '@pops/ui';

import { PrintCodeField } from './print-code-field';

import type { TakenCode } from './print-code-field';
import type { PrintSubject } from './print-subject';

/** Props for {@link PrintSelectionRow}. */
export interface PrintSelectionRowProps {
  subject: PrintSubject;
  editing: boolean;
  /** What the code field opens holding, when not the suggestion. */
  editingDraft?: string;
  /** Opens the code field already showing the taken-code refusal. */
  editingTaken?: boolean;
  lookup: (code: string) => TakenCode | null;
  onEdit: (id: string | null) => void;
  onSetCode: (id: string, code: string) => void;
  onRemove: (id: string) => void;
}

function Mark({ kind }: { kind: PrintSubject['kind'] }) {
  const Icon = kind === 'container' ? Package : Tag;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-app-accent/15 text-app-accent">
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

function CodeLine({ row }: { row: PrintSelectionRowProps }) {
  const { subject } = row;
  if (subject.code) {
    return <span className="font-mono text-xs font-semibold">{subject.code}</span>;
  }
  const suggestion = subject.suggestedCode;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      No code
      {suggestion ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 font-mono text-xs"
          onClick={() => row.onSetCode(subject.id, suggestion)}
        >
          Add {suggestion}
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        aria-label={`Type a code for ${subject.name}`}
        onClick={() => row.onEdit(subject.id)}
      >
        <Pencil className="size-3.5" aria-hidden />
      </Button>
    </span>
  );
}

/** One row of the selection list. */
export function PrintSelectionRow(row: PrintSelectionRowProps) {
  const { subject } = row;
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
        {row.editing ? (
          <PrintCodeField
            itemName={subject.name}
            initial={row.editingDraft ?? subject.suggestedCode ?? ''}
            lookup={row.lookup}
            initialTaken={row.editingTaken}
            onSave={(code) => {
              row.onSetCode(subject.id, code);
              row.onEdit(null);
            }}
            onCancel={() => row.onEdit(null)}
          />
        ) : (
          <CodeLine row={row} />
        )}
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
