import { cn, formatCents } from '@pops/ui';

import { landedCostLine, lineMetaLine } from './format';

import type { OrderLine, OrderLineTag, OrderLineUnit } from '@/fixtures/purchases-order-types';

interface LineListProps {
  lines: OrderLine[];
  currency: string;
  /** The line a search hit addressed, if the reader arrived through one. */
  highlightedItemId: string | null;
}

/**
 * The lines, in the order the order carries them.
 *
 * A line hit in global search opens the order rather than a page of its
 * own, so the line that was searched for is marked here. Nothing is
 * re-sorted: `position` is the merchant's own ordering and a second one
 * here would be a second place for it to be wrong.
 */
export function LineList({ lines, currency, highlightedItemId }: LineListProps) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">This order carries no lines.</p>;
  }

  return (
    <ul aria-label="Lines on this order" className="space-y-3">
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

function LineRow({
  line,
  currency,
  isHighlighted,
}: {
  line: OrderLine;
  currency: string;
  isHighlighted: boolean;
}) {
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
      <p className="text-xs text-muted-foreground">{lineMetaLine(item, currency)}</p>
      <p className="text-xs text-muted-foreground">{landedCostLine(line, currency)}</p>
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
function LineTags({ tags }: { tags: OrderLineTag[] }) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="Tags on this line" className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <li
          key={tag.tag}
          data-confirmed={tag.confirmedAt !== null}
          className="rounded bg-muted px-2 py-0.5 text-xs"
        >
          {tag.confirmedAt === null ? `${tag.tag} (unconfirmed)` : tag.tag}
        </li>
      ))}
    </ul>
  );
}

/**
 * The physical things a line became. `inventoryItemUri` is a soft
 * cross-pillar reference, shown as the URI it is rather than as a link this
 * screen cannot follow.
 */
function LineUnits({ units }: { units: OrderLineUnit[] }) {
  if (units.length === 0) return null;
  return (
    <ul aria-label="Units this line became" className="space-y-1 text-xs">
      {units.map((unit) => (
        <li key={unit.id} className="text-muted-foreground">
          {unit.serialNumber ?? 'No serial number'}
          {unit.inventoryItemUri !== null && (
            <span className="ml-2 font-mono break-all">{unit.inventoryItemUri}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function LineNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul aria-label="Notes on this line" className="text-xs text-muted-foreground">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}
