import { cn } from '@pops/ui';

import { FactRowContent } from './fact-row-content';

import type { KeyboardEvent, ReactElement, ReactNode } from 'react';

import type { DetailFact } from './detail-model';
import type { FactPhase } from './use-fact-editing';

/** Props for one read-only fact row. */
export interface FactRowProps {
  fact: DetailFact;
  readOnly?: boolean;
  onQuantity?: (action: 'split' | 'change') => void;
  inlineLabel?: boolean;
  phase?: FactPhase;
  rejection?: string;
  onEdit?: (key: string) => void;
  editor?: ReactNode;
  onRevert?: () => void;
}

function handleFactKeyDown({
  event,
  phase,
  editable,
  factKey,
  onEdit,
  onRevert,
}: {
  event: KeyboardEvent<HTMLDivElement>;
  phase: FactPhase;
  editable: boolean;
  factKey: string;
  onEdit: FactRowProps['onEdit'];
  onRevert: FactRowProps['onRevert'];
}): void {
  if (phase === 'saving') return;
  if (phase === 'editing') {
    if (event.key === 'Escape') {
      event.preventDefault();
      onRevert?.();
      return;
    }
    if (event.key !== 'Enter' || event.defaultPrevented || event.shiftKey) return;
    event.preventDefault();
    onEdit?.(factKey);
    return;
  }
  if (!editable || event.key !== 'Enter') return;
  event.preventDefault();
  onEdit?.(factKey);
}

/** Renders one fact, including its inline editor and optimistic edit phases. */
export function FactRow({
  fact,
  readOnly = false,
  onQuantity,
  inlineLabel = false,
  phase = 'idle',
  rejection,
  onEdit,
  editor,
  onRevert,
}: FactRowProps): ReactElement {
  const editing = phase === 'editing' || phase === 'saving';
  const editable = !readOnly && onEdit !== undefined && fact.inline;
  return (
    <div
      className={cn(
        'flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2 py-1',
        phase === 'pending' && 'border-l-2 border-app-accent bg-app-accent/5',
        phase === 'rejected' && 'border-l-2 border-destructive/60'
      )}
      onKeyDown={(event) =>
        handleFactKeyDown({ event, phase, editable, factKey: fact.key, onEdit, onRevert })
      }
    >
      <FactRowContent
        fact={fact}
        inlineLabel={inlineLabel}
        editing={editing}
        editable={editable}
        phase={phase}
        editor={editor}
        onEdit={onEdit}
        onQuantity={onQuantity}
        rejection={rejection}
      />
    </div>
  );
}
