import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@pops/ui';

import type { ListItemRow } from './types.js';

/** Renders an item's reference label and expands a truncated note on tap. */
export function ListItemSubline({ row }: { row: ListItemRow }) {
  const { t } = useTranslation('lists');
  const text = formatSubline(row, t, false);

  if (row.notes !== null && row.notes.length > 0) {
    return <NoteDisclosure row={row} t={t} />;
  }
  if (text === null) return null;
  return (
    <p className="truncate text-xs text-muted-foreground" title={text}>
      {text}
    </p>
  );
}

function NoteDisclosure({ row, t }: { row: ListItemRow; t: (key: string) => string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = formatSubline(row, t, false);
  const fullText = formatSubline(row, t, true);
  if (preview === null || fullText === null) return null;
  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          aria-label={fullText}
          title={fullText}
          className="flex min-h-11 w-full items-center gap-2 text-left text-xs text-muted-foreground sm:min-h-0"
        >
          <span className="min-w-0 truncate">{preview}</span>
          <span className="shrink-0 text-primary sm:hidden">
            {expanded ? t('detail.item.showLess') : t('detail.item.showMore')}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="whitespace-normal text-xs text-muted-foreground">{fullText}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function formatSubline(
  row: ListItemRow,
  t: (key: string) => string,
  expanded: boolean
): string | null {
  let noteSummary: string | null = null;
  if (row.notes !== null && row.notes.length > 0) {
    noteSummary = expanded ? row.notes : truncate(row.notes, 80);
  }
  if (row.refKind !== 'free') {
    const refLabel = t(`detail.item.ref.${row.refKind}`);
    return noteSummary !== null ? `${refLabel} · ${noteSummary}` : refLabel;
  }
  return noteSummary;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
