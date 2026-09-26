import { ChevronRight } from 'lucide-react';

import { ButtonPrimitive, cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../model/icons';

import type { ReactNode } from 'react';

import type { InventoryConcept } from '../model/icons';
import type { PlacementTarget } from '../model/model';
import type { PickerModel, PickerOption } from './use-picker-state';

function conceptFor(option: PickerOption): InventoryConcept {
  if (option.kind === 'in-hand') return 'inHand';
  if (option.kind === 'location') return 'location';
  return option.access === 'open' ? 'open' : 'closed';
}

/** Props for {@link PickerRow}. */
export interface PickerRowProps {
  option: PickerOption;
  onPick: (target: PlacementTarget) => void;
  onDrill?: (locationId: string) => void;
  /** Replaces the row label, such as `Put back to Red toolbox`. */
  label?: string;
  concept?: InventoryConcept;
  emphasis?: boolean;
  /** Hides the path when the breadcrumb already supplies it. */
  hideDetail?: boolean;
}

function RowBody({
  option,
  label,
  concept,
  hideDetail,
}: Pick<PickerRowProps, 'option' | 'label' | 'concept' | 'hideDetail'>) {
  const Icon = INVENTORY_ICONS[concept ?? conceptFor(option)];
  const tone = option.kind === 'container' ? 'text-app-accent' : 'text-muted-foreground';
  const note = option.disabledReason ?? (hideDetail === true ? '' : option.detail);

  return (
    <>
      <Icon className={cn('size-4 shrink-0', tone)} aria-hidden />
      <span className="shrink-0 truncate font-medium">{label ?? option.label}</span>
      <span className="min-w-0 truncate text-xs text-muted-foreground">{note}</span>
      {option.full && option.disabledReason === null ? (
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">Full</span>
      ) : null}
    </>
  );
}

function DrillButton({ option, onDrill }: Pick<PickerRowProps, 'option' | 'onDrill'>) {
  const { target } = option;
  if (!option.drillable || target.kind !== 'location' || onDrill === undefined) return null;

  return (
    <ButtonPrimitive
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Show places in ${option.label}`}
      onClick={() => onDrill(target.locationId)}
    >
      <ChevronRight className="size-4" aria-hidden />
    </ButtonPrimitive>
  );
}

/** Renders one destination row, preserving refused targets with their reason. */
export function PickerRow({ option, onPick, onDrill, emphasis = false, ...body }: PickerRowProps) {
  const refused = option.disabledReason !== null;

  return (
    <li className="flex items-center gap-0.5">
      <ButtonPrimitive
        type="button"
        data-picker-row
        variant="ghost"
        size="sm"
        aria-disabled={refused || undefined}
        title={option.disabledReason ?? undefined}
        onClick={refused ? undefined : () => onPick(option.target)}
        className={cn(
          'h-9 min-w-0 flex-1 justify-start gap-2 px-2 font-normal',
          emphasis && 'bg-app-accent/10 hover:bg-app-accent/20',
          refused && 'cursor-not-allowed opacity-60 hover:bg-transparent'
        )}
      >
        <RowBody option={option} {...body} />
      </ButtonPrimitive>
      <DrillButton option={option} onDrill={onDrill} />
    </li>
  );
}

/** Renders a labelled group of destination rows when it is non-empty. */
export function PickerSection({
  title,
  children,
  empty,
}: {
  title: string;
  children: ReactNode;
  empty?: boolean;
}) {
  if (empty) return null;

  return (
    <section aria-label={title}>
      <h3 className="px-2 pt-2 pb-1 text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        {title}
      </h3>
      <ul>{children}</ul>
    </section>
  );
}

/** Renders put-back, recents, open containers, and the In hand destination. */
export function QuickPicks({
  model,
  onPick,
}: {
  model: PickerModel;
  onPick: (target: PlacementTarget) => void;
}) {
  return (
    <div className="space-y-1">
      {model.putBack ? (
        <ul>
          <PickerRow
            option={model.putBack}
            onPick={onPick}
            label={`Put back to ${model.putBack.label}`}
            concept="putBack"
            emphasis
          />
        </ul>
      ) : null}
      {model.putBackGone ? (
        <p className="flex items-center gap-2 rounded-md bg-muted px-2 py-2 text-xs text-muted-foreground">
          <INVENTORY_ICONS.putBack className="size-4 shrink-0" aria-hidden />
          Previous place, {model.putBackGone}, was deleted. Choose a new one.
        </p>
      ) : null}
      <PickerSection title="Recent" empty={model.recents.length === 0}>
        {model.recents.map((option) => (
          <PickerRow key={option.key} option={option} onPick={onPick} />
        ))}
      </PickerSection>
      <PickerSection title="Open containers" empty={model.openContainers.length === 0}>
        {model.openContainers.map((option) => (
          <PickerRow key={option.key} option={option} onPick={onPick} />
        ))}
      </PickerSection>
      {model.inHand ? (
        <ul className="border-t pt-1">
          <PickerRow option={model.inHand} onPick={onPick} />
        </ul>
      ) : null}
    </div>
  );
}
