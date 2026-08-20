import { useTranslation } from 'react-i18next';

import { cn, formatCents } from '@pops/ui';

import type { ReactElement } from 'react';

import type { PurchaseLine, SkuScheme } from './types.js';

/**
 * How each namespace is named to a reader.
 *
 * A record rather than a template over the raw scheme: `merchant` is a POPS
 * word for "only this shop knows what this number means", and rendering it
 * untranslated next to translated text is how an internal vocabulary leaks
 * onto the page. Keyed by the scheme so a namespace added to the contract
 * fails to compile here rather than printing its own enum token.
 */
const SKU_LABEL_KEYS: Record<SkuScheme, string> = {
  asin: 'purchase.items.skuAsin',
  merchant: 'purchase.items.skuMerchant',
};

interface LineListProps {
  lines: PurchaseLine[];
  currency: string;
  /** The line a search hit addressed, if the reader arrived through one. */
  highlightedItemId: string | null;
}

/**
 * The lines, in the order the order carries them.
 *
 * A line hit in global search opens this page rather than one of its own —
 * the pillar reads a line only through its order — so the line that was
 * searched for is marked here. Nothing is re-sorted: `position` is the
 * merchant's own ordering and a second one here would be a second place for
 * it to be wrong.
 */
export function LineList({ lines, currency, highlightedItemId }: LineListProps): ReactElement {
  const { t } = useTranslation('purchases');

  if (lines.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('purchase.items.empty')}</p>;
  }

  return (
    <ul aria-label={t('purchase.items.ariaLabel')} className="space-y-3">
      {lines.map((line) => (
        <LineRow
          key={line.item.id}
          line={line}
          currency={currency}
          isHighlighted={line.item.id === highlightedItemId}
        />
      ))}
    </ul>
  );
}

interface LineRowProps {
  line: PurchaseLine;
  currency: string;
  isHighlighted: boolean;
}

function LineRow({ line, currency, isHighlighted }: LineRowProps): ReactElement {
  const { t } = useTranslation('purchases');
  const { item } = line;

  return (
    <li
      data-item-id={item.id}
      aria-current={isHighlighted ? 'true' : undefined}
      className={cn(
        'space-y-2 rounded-md border p-4',
        isHighlighted && 'border-primary bg-accent/40'
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{item.name}</p>
        <p className="tabular-nums">{formatCents(item.lineTotalCents, currency)}</p>
      </div>

      <p className="text-muted-foreground text-xs">
        {item.sku === null
          ? t('purchase.items.noSku')
          : t(SKU_LABEL_KEYS[item.sku.scheme], { value: item.sku.value })}{' '}
        · {t('purchase.items.quantity', { count: item.quantity })} ·{' '}
        {t('purchase.items.unitPrice', { amount: formatCents(item.unitPriceCents, currency) })}
      </p>

      <p className="text-muted-foreground text-xs">
        {t('purchase.items.landedCost', {
          amount: formatCents(line.landedCostCents, currency),
        })}
        {item.refundedCents > 0 &&
          ` · ${t('purchase.items.refunded', {
            amount: formatCents(item.refundedCents, currency),
          })}`}
        {item.kind !== null && ` · ${t(`purchase.kind.${item.kind.value}`)}`}
      </p>

      <LineTags tags={line.tags} />
      <LineUnits units={line.units} />
      <LineNotes notes={line.notes} />
    </li>
  );
}

/**
 * A tag the pillar inferred and a tag a human confirmed are not the same
 * claim, so the unconfirmed ones say so rather than reading as settled fact.
 */
function LineTags({ tags }: { tags: PurchaseLine['tags'] }): ReactElement | null {
  const { t } = useTranslation('purchases');
  if (tags.length === 0) return null;

  return (
    <ul aria-label={t('purchase.items.tagsLabel')} className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <li
          key={tag.tag}
          data-confirmed={tag.confirmedAt !== null}
          className="bg-muted rounded px-2 py-0.5 text-xs"
        >
          {tag.confirmedAt === null
            ? t('purchase.items.tagUnconfirmed', { tag: tag.tag })
            : tag.tag}
        </li>
      ))}
    </ul>
  );
}

/**
 * The physical things a line became. `inventoryItemUri` is a soft cross-pillar
 * reference, so it is shown as the URI it is rather than as a link this app
 * cannot follow.
 */
function LineUnits({ units }: { units: PurchaseLine['units'] }): ReactElement | null {
  const { t } = useTranslation('purchases');
  if (units.length === 0) return null;

  return (
    <ul aria-label={t('purchase.items.unitsLabel')} className="space-y-1 text-xs">
      {units.map((unit) => (
        <li key={unit.id} className="text-muted-foreground">
          {unit.serialNumber ?? t('purchase.items.unitNoSerial')}
          {unit.inventoryItemUri !== null && (
            <span className="ml-2 font-mono break-all">{unit.inventoryItemUri}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function LineNotes({ notes }: { notes: string[] }): ReactElement | null {
  const { t } = useTranslation('purchases');
  if (notes.length === 0) return null;

  return (
    <ul aria-label={t('purchase.items.notesLabel')} className="text-muted-foreground text-xs">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}
