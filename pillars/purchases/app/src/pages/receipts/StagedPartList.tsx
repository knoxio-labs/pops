import { useTranslation } from 'react-i18next';

import { Button, formatBytes } from '@pops/ui';

import type { ReactElement } from 'react';

import type { StagedPart } from './parts.js';

export interface StagedPartListProps {
  parts: StagedPart[];
  disabled: boolean;
  onRemove: (index: number) => void;
  onMove: (index: number, offset: -1 | 1) => void;
}

/**
 * The staged parts, in the order they will be sent.
 *
 * Ordered and reorderable because the server reads them top to bottom as one
 * receipt: three frames of a supermarket shop out of order are a different
 * document, and neither the model nor the gate can tell that from a shuffled
 * one.
 */
export function StagedPartList({
  parts,
  disabled,
  onRemove,
  onMove,
}: StagedPartListProps): ReactElement {
  const { t } = useTranslation('purchases');

  if (parts.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center">
        <p className="text-muted-foreground text-sm">{t('receipts.parts.empty')}</p>
      </div>
    );
  }

  return (
    <ol aria-label={t('receipts.parts.ariaLabel')} className="space-y-2">
      {parts.map((part, index) => (
        <StagedPartRow
          key={part.id}
          part={part}
          index={index}
          count={parts.length}
          disabled={disabled}
          onRemove={onRemove}
          onMove={onMove}
        />
      ))}
    </ol>
  );
}

interface StagedPartRowProps extends Omit<StagedPartListProps, 'parts'> {
  part: StagedPart;
  index: number;
  count: number;
}

function StagedPartRow({
  part,
  index,
  count,
  disabled,
  onRemove,
  onMove,
}: StagedPartRowProps): ReactElement {
  const { t } = useTranslation('purchases');
  const name = part.name ?? t('receipts.parts.pasted');

  return (
    <li className="flex items-center gap-3 rounded-md border p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-muted-foreground text-xs">
          {t('receipts.parts.position', { position: index + 1, count })} · {part.mediaType} ·{' '}
          {formatBytes(part.byteLength)}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || index === 0}
        aria-label={t('receipts.parts.moveUp', { name })}
        onClick={() => onMove(index, -1)}
      >
        ↑
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || index === count - 1}
        aria-label={t('receipts.parts.moveDown', { name })}
        onClick={() => onMove(index, 1)}
      >
        ↓
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        aria-label={t('receipts.parts.remove', { name })}
        onClick={() => onRemove(index)}
      >
        ✕
      </Button>
    </li>
  );
}
