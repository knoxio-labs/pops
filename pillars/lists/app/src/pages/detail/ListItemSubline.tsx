import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@pops/ui';

import type { ListItemRow } from './types.js';

const NOTE_PREVIEW_LENGTH = 80;

/** Renders an item's reference label and expands a truncated note on tap. */
export function ListItemSubline({ row }: { row: ListItemRow }) {
  const { t } = useTranslation('lists');
  const text = formatSubline(row, t, false);
  const hasNote = row.notes !== null && row.notes.length > 0;

  if (row.notes !== null && row.notes.length > NOTE_PREVIEW_LENGTH) {
    return <NoteDisclosure row={row} t={t} />;
  }
  if (text === null) return null;
  return (
    <p
      className={`${hasNote ? 'whitespace-normal break-words' : 'truncate'} text-xs text-muted-foreground`}
      title={text}
    >
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
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-full justify-start px-0 text-left text-xs font-normal text-muted-foreground sm:h-auto sm:py-0"
          aria-label={fullText}
          title={fullText}
        >
          <span className="min-w-0 truncate">{preview}</span>
          <span className="shrink-0 text-primary sm:hidden">
            {expanded ? t('detail.item.showLess') : t('detail.item.showMore')}
          </span>
        </Button>
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
    noteSummary = expanded ? row.notes : truncate(row.notes, NOTE_PREVIEW_LENGTH);
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
