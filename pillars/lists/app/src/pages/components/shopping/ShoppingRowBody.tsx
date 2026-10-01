import { type KeyboardEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Collapsible, CollapsibleContent, CollapsibleTrigger, TextInput } from '@pops/ui';

import type { ListItemRow as ItemRow } from '../../detail/types.js';

/**
 * Body of a `ShoppingItemRow` — always-visible qty/unit prefix, inline
 * label editor when active, and the notes-as-subline.
 */
export interface ShoppingRowBodyProps {
  row: ItemRow;
  isChecked: boolean;
  isDragDisabled: boolean;
  edit: {
    editing: boolean;
    draft: string;
    setDraft: (value: string) => void;
    begin: () => void;
    commit: () => Promise<void>;
  };
  onLabelKey: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export function ShoppingRowBody(props: ShoppingRowBodyProps): React.ReactElement {
  const { t } = useTranslation('lists');
  const { row, isChecked, edit, onLabelKey } = props;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2">
        <span
          className={`min-w-14 text-sm tabular-nums ${
            isChecked ? 'text-muted-foreground' : 'text-foreground'
          }`}
          data-testid="qty-unit"
        >
          {formatQtyUnit(row)}
        </span>
        {edit.editing ? (
          <div className="min-w-0 flex-1">
            <TextInput
              size="sm"
              // h-8 matches the row's tallest sibling (the 32px checkbox and
              // drag handle); the kit's smallest height, h-9, makes the row
              // grow 4px the moment the editor opens.
              containerClassName="h-8"
              value={edit.draft}
              onChange={(e) => edit.setDraft(e.target.value)}
              onBlur={() => void edit.commit()}
              onKeyDown={onLabelKey}
              aria-label={t('shopping.item.editLabel')}
              autoFocus
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={edit.begin}
            className={`flex-1 text-left text-sm ${
              isChecked ? 'text-muted-foreground line-through opacity-60' : ''
            }`}
          >
            {row.label}
          </button>
        )}
      </div>
      <Subline notes={row.notes} isDragDisabled={props.isDragDisabled} />
    </div>
  );
}

function Subline({ notes, isDragDisabled }: { notes: string | null; isDragDisabled: boolean }) {
  const { t } = useTranslation('lists');
  const [expanded, setExpanded] = useState(false);
  const hasNotes = notes !== null && notes.length > 0;
  if (!hasNotes && !isDragDisabled) return null;
  return (
    <div>
      {hasNotes ? (
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={notes ?? undefined}
              title={notes ?? undefined}
              className="flex min-h-11 w-full items-center gap-2 text-left text-xs text-muted-foreground sm:min-h-0"
            >
              <span className="min-w-0 truncate">{notes}</span>
              <span className="shrink-0 text-primary sm:hidden">
                {expanded ? t('shopping.item.showLess') : t('shopping.item.showMore')}
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="whitespace-normal text-xs text-muted-foreground">{notes}</p>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      {isDragDisabled ? (
        <p className="text-xs text-muted-foreground sm:sr-only">
          {t('shopping.item.dragDisabled')}
        </p>
      ) : null}
    </div>
  );
}

function formatQtyUnit(row: ItemRow): string {
  const qty = row.qty;
  const unit = row.unit;
  if (qty === null && unit === null) return '—';
  const qtyText = qty === null ? '' : formatQty(qty);
  return unit === null ? qtyText : `${qtyText} ${unit}`.trim();
}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, '');
}
