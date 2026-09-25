/**
 * The line between the toolbar and the list: how many rows this view
 * resolves to (and of how many), how many inactive rows it leaves out, one
 * removable chip per active filter, and the view's link. Filters live in
 * the URL, so the link is the bookmark (spec 1.3: no saved searches).
 */
import { Link2, X } from 'lucide-react';

import { Button, ButtonPrimitive } from '@pops/ui';

import { HintTooltip } from '../foundation';

/** One active filter, named and removable. */
export interface SummaryChip {
  id: string;
  label: string;
  onRemove: () => void;
}

/** Props for {@link ItemsSummary}. */
export interface ItemsSummaryProps {
  shown: number;
  total: number;
  noun: string;
  hiddenInactive: number;
  chips: readonly SummaryChip[];
  address: string;
}

const n = (value: number): string => value.toLocaleString('en-AU');

function Chip({ chip }: { chip: SummaryChip }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-app-accent/40 bg-app-accent/10 pl-2.5 text-xs">
      {chip.label}
      <ButtonPrimitive
        variant="ghost"
        size="icon-xs"
        className="size-6 rounded-full"
        aria-label={`Remove filter ${chip.label}`}
        onClick={chip.onRemove}
      >
        <X className="size-3" aria-hidden />
      </ButtonPrimitive>
    </span>
  );
}

function countText({ shown, total, noun, hiddenInactive }: ItemsSummaryProps): string {
  const head = shown === total ? `${n(total)} ${noun}` : `${n(shown)} of ${n(total)} ${noun}`;
  return hiddenInactive > 0 ? `${head}, ${n(hiddenInactive)} inactive not shown` : head;
}

/** The summary line. */
export function ItemsSummary(props: ItemsSummaryProps) {
  return (
    <div className="flex min-h-6 items-center gap-2 text-sm">
      <p aria-live="polite" className="shrink-0 text-muted-foreground tabular-nums">
        {countText(props)}
      </p>
      {props.chips.map((chip) => (
        <Chip key={chip.id} chip={chip} />
      ))}
      <HintTooltip label={props.address}>
        <Button
          variant="ghost"
          size="sm"
          className="-my-1.5 ml-auto text-xs text-muted-foreground"
          prefix={<Link2 className="size-3.5" aria-hidden />}
        >
          Copy link to this view
        </Button>
      </HintTooltip>
    </div>
  );
}
