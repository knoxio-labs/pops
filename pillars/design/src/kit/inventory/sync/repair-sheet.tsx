/**
 * One case at a time (iOS #6): the facts, what this web app can do about it
 * and what that does, and the choice that stays on the phone. Previous and
 * Next walk the open cases without closing the sheet.
 */
import { ChevronLeft, ChevronRight, Smartphone } from 'lucide-react';

import { Button, ButtonPrimitive } from '@pops/ui';

import { HintTooltip } from '../shared/hint-tooltip';
import { SheetPanel } from '../shared/sheet';
import { RepairEvidence, SheetSection } from './repair-evidence';
import { planFor } from './repair-plan';

import type { ReactNode } from 'react';

import type { CasePosition, RepairCase } from './sync-model';

/** Props for {@link RepairSheet}. */
export interface RepairSheetProps {
  repair: RepairCase;
  device: string;
  now: string;
  position: CasePosition | null;
  /** Mutations are off: the web actions say why. */
  disabledReason?: string;
  onStep?: (id: string) => void;
  onClose?: () => void;
}

/** The phone's part, always stated, with the phone's name. */
export function OnDevice({ device, children }: { device: string; children: ReactNode }) {
  return (
    <SheetSection title={`On ${device}`}>
      <p className="flex gap-2.5 text-sm">
        <Smartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>{children}</span>
      </p>
    </SheetSection>
  );
}

function Stepper({
  position,
  onStep,
}: {
  position: CasePosition | null;
  onStep?: (id: string) => void;
}) {
  if (position === null || position.total < 2) return null;
  const step = (id: string | null, label: string, icon: ReactNode) => (
    <HintTooltip
      label={label}
      disabledReason={id === null ? `No ${label.toLowerCase()} case` : undefined}
    >
      <ButtonPrimitive
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-disabled={id === null || undefined}
        className={id === null ? 'opacity-40' : undefined}
        onClick={id === null ? undefined : () => onStep?.(id)}
      >
        {icon}
      </ButtonPrimitive>
    </HintTooltip>
  );
  return (
    <span className="mr-auto flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
      {step(position.previousId, 'Previous', <ChevronLeft className="size-4" aria-hidden />)}
      {position.index + 1} of {position.total}
      {step(position.nextId, 'Next', <ChevronRight className="size-4" aria-hidden />)}
    </span>
  );
}

function Actions({
  repair,
  device,
  disabledReason,
}: Pick<RepairSheetProps, 'repair' | 'device' | 'disabledReason'>) {
  const plan = planFor(repair, device);
  const off = disabledReason !== undefined;
  return (
    <>
      {plan.secondary.map((action) => (
        <Button key={action.id} size="sm" variant="outline">
          {action.label}
        </Button>
      ))}
      {plan.primary ? (
        <HintTooltip label={plan.primary.outcome} disabledReason={disabledReason}>
          <Button
            size="sm"
            aria-disabled={off || undefined}
            className={off ? 'opacity-50' : undefined}
          >
            {plan.primary.label}
          </Button>
        </HintTooltip>
      ) : null}
    </>
  );
}

/** The sheet for one open case. */
export function RepairSheet(props: RepairSheetProps) {
  const { repair, device, now } = props;
  const plan = planFor(repair, device);
  return (
    <SheetPanel
      title={repair.itemName}
      description={repair.problem}
      onClose={props.onClose}
      className="rounded-xl"
      footer={
        <>
          <Stepper position={props.position} onStep={props.onStep} />
          <Actions repair={repair} device={device} disabledReason={props.disabledReason} />
        </>
      }
    >
      <div className="space-y-5">
        <RepairEvidence repair={repair} now={now} />
        {plan.primary ? (
          <SheetSection title="From this web app">
            <p className="text-sm">
              <span className="font-medium">{plan.primary.label}.</span> {plan.primary.outcome}
            </p>
          </SheetSection>
        ) : null}
        <OnDevice device={device}>{plan.onDevice}</OnDevice>
      </div>
    </SheetPanel>
  );
}
