import { forwardRef, useMemo } from 'react';

import { Button } from '@pops/ui';

import { INVENTORY_ICONS } from '../model/icons.js';
import { PlacementPicker } from '../placement-picker/placement-picker.js';
import { HintTooltip } from '../shortcuts/hint-tooltip.js';
import { ShortcutHint } from '../shortcuts/shortcut-hint.js';

import type { ComponentPropsWithoutRef, ReactElement } from 'react';

import type { LocationModel } from '../model/model.js';
import type { PlacementWorld } from '../model/placement-model.js';

/** Props for the place-only Move picker trigger. */
export interface MovePlaceButtonProps {
  world: PlacementWorld;
  place: LocationModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (parentId: string) => void;
  disabledReason?: string;
}

type TriggerProps = Omit<
  ComponentPropsWithoutRef<typeof Button>,
  'children' | 'disabled' | 'prefix' | 'suffix'
> & {
  disabledReason?: string;
};

const Trigger = forwardRef<HTMLButtonElement, TriggerProps>(
  ({ disabledReason, ...props }, ref): ReactElement => {
    const button = (
      <Button
        {...props}
        ref={ref}
        size="sm"
        variant="ghost"
        disabled={disabledReason !== undefined}
        aria-disabled={disabledReason !== undefined ? 'true' : undefined}
        prefix={<INVENTORY_ICONS.move className="size-4" aria-hidden />}
        suffix={disabledReason === undefined ? <ShortcutHint id="move" /> : undefined}
      >
        Move
      </Button>
    );
    return disabledReason === undefined ? (
      button
    ) : (
      <HintTooltip label="Move" disabledReason={disabledReason}>
        {button}
      </HintTooltip>
    );
  }
);

Trigger.displayName = 'MovePlaceTrigger';

/** Opens a placement picker that accepts only valid parent locations for one place. */
export function MovePlaceButton({
  world,
  place,
  open,
  onOpenChange,
  onPick,
  disabledReason = undefined,
}: MovePlaceButtonProps): ReactElement {
  const subject = useMemo(() => ({ kind: 'place' as const, locationId: place.id }), [place.id]);
  return (
    <PlacementPicker
      world={world}
      subject={subject}
      recents={[]}
      initialDrillId={place.parentId}
      open={disabledReason === undefined && open}
      onOpenChange={onOpenChange}
      onPick={(target) => {
        if (target.kind === 'location') onPick(target.locationId);
        onOpenChange(false);
      }}
      trigger={<Trigger disabledReason={disabledReason} />}
    />
  );
}
