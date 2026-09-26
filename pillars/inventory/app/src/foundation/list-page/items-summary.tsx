import { Link2, X } from 'lucide-react';

import { Button, ButtonPrimitive } from '@pops/ui';

import { HintTooltip } from '../shortcuts/hint-tooltip.js';

import type { ReactElement } from 'react';

import type { SummaryChip } from './list-filters.js';

/** Props for {@link ItemsSummary}. */
export interface ItemsSummaryProps {
  /** How many rows the current filters resolve to on the server. */
  shown: number;
  /** The same list with no narrowing filter. */
  total: number;
  noun: string;
  hiddenInactive: number;
  chips: readonly SummaryChip[];
  href: string;
}

const number = (value: number): string => value.toLocaleString('en-AU');

function countText({ shown, total, noun, hiddenInactive }: ItemsSummaryProps): string {
  const head =
    shown === total ? `${number(total)} ${noun}` : `${number(shown)} of ${number(total)} ${noun}`;
  return hiddenInactive > 0 ? `${head}, ${number(hiddenInactive)} inactive not shown` : head;
}

function Chip({ chip }: { chip: SummaryChip }): ReactElement {
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

/** Renders server counts, active filter chips, and a copyable view link. */
export function ItemsSummary(props: ItemsSummaryProps): ReactElement {
  const copyLink = (): void => {
    const write = navigator.clipboard?.writeText;
    if (write !== undefined)
      void write.call(navigator.clipboard, window.location.origin + props.href);
  };

  return (
    <div className="flex min-h-6 items-center gap-2 text-sm">
      <p aria-live="polite" className="shrink-0 text-muted-foreground tabular-nums">
        {countText(props)}
      </p>
      {props.chips.map((chip) => (
        <Chip key={chip.id} chip={chip} />
      ))}
      <HintTooltip label={props.href}>
        <Button
          variant="ghost"
          size="sm"
          className="-my-1.5 ml-auto text-xs text-muted-foreground"
          prefix={<Link2 className="size-3.5" aria-hidden />}
          onClick={copyLink}
        >
          Copy link to this view
        </Button>
      </HintTooltip>
    </div>
  );
}
