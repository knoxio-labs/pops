import { ChevronLeft, ChevronRight, Smartphone } from 'lucide-react';

import { Button, ButtonPrimitive, SheetPanel } from '@pops/ui';

import { HintTooltip } from '../../../foundation/shortcuts/hint-tooltip.js';
import { useShortcutScope } from '../../../foundation/shortcuts/shortcut-provider.js';
import { SheetSection } from '../sheet-section.js';
import { RepairEvidence } from './repair-evidence.js';
import { planFor } from './repair-plan.js';
import { useRepairActions } from './use-repair-actions.js';

import type { ReactElement, ReactNode } from 'react';

import type { CasePosition, RepairCase } from '../sync-model.js';
import type { WebAction } from './repair-plan.js';

type PlannedAction = WebAction & { outcome?: string };

/** Props for {@link RepairSheet}. */
export interface RepairSheetProps {
  repair: RepairCase;
  device: string;
  now: string;
  position: CasePosition | null;
  disabledReason?: string;
  onStep: (caseId: string) => void;
  onClose: () => void;
}

/** Renders the device-owned portion of a repair decision. */
export function OnDevice({
  device,
  children,
}: {
  device: string;
  children: ReactNode;
}): ReactElement {
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
  onStep: (caseId: string) => void;
}): ReactElement | null {
  if (position === null || position.total < 2) return null;
  const step = (id: string | null, label: string, icon: ReactNode): ReactElement => (
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
        onClick={id === null ? undefined : () => onStep(id)}
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

function isWrite(actionId: string): boolean {
  return (
    actionId === 'use-suggested' ||
    actionId === 'restore' ||
    actionId === 'upload' ||
    actionId === 'use-mine' ||
    actionId === 'save-fitting' ||
    actionId === 'change-type' ||
    actionId === 'restore-reference'
  );
}

function ActionButton({
  action,
  blockedReason,
  busy,
  onRun,
  primary = false,
}: {
  action: PlannedAction;
  blockedReason: string | null;
  busy: boolean;
  onRun: (action: PlannedAction) => void;
  primary?: boolean;
}): ReactElement {
  const disabled = blockedReason !== null || (busy && isWrite(action.id));
  const label =
    blockedReason ??
    ('outcome' in action && action.outcome !== undefined ? action.outcome : action.label);
  return (
    <HintTooltip label={label} disabledReason={blockedReason ?? undefined}>
      <Button
        size="sm"
        variant={primary ? 'default' : 'outline'}
        aria-disabled={disabled || undefined}
        className={disabled ? 'opacity-50' : undefined}
        onClick={() => onRun(action)}
      >
        {action.label}
      </Button>
    </HintTooltip>
  );
}

/** Renders one repair case with evidence, web actions, and the phone's choice. */
export function RepairSheet({
  repair,
  device,
  now,
  position,
  disabledReason,
  onStep,
  onClose,
}: RepairSheetProps): ReactElement {
  const plan = planFor(repair, device);
  const actions = useRepairActions({ repair, device, disabledReason });
  useShortcutScope('detail', { dismiss: () => (onClose(), true) });

  return (
    <SheetPanel
      title={repair.itemName}
      description={repair.problem}
      onClose={onClose}
      className="rounded-xl"
      footer={
        <>
          <Stepper position={position} onStep={onStep} />
          {plan.secondary.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              blockedReason={actions.blockedReason(action)}
              busy={actions.busy}
              onRun={(next) => void actions.run(next)}
            />
          ))}
          {plan.primary ? (
            <ActionButton
              action={plan.primary}
              blockedReason={actions.blockedReason(plan.primary)}
              busy={actions.busy}
              onRun={(next) => void actions.run(next)}
              primary
            />
          ) : null}
        </>
      }
    >
      <div className="space-y-5">
        {actions.refusal ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm"
          >
            {actions.refusal}
          </p>
        ) : null}
        {actions.fileInput}
        <RepairEvidence repair={repair} now={now} />
        {plan.primary ? (
          <SheetSection title="From this web app">
            <p className="text-sm">
              <span className="font-medium">{plan.primary.label}.</span> {plan.primary.outcome}
            </p>
          </SheetSection>
        ) : null}
        {plan.onDevice ? <OnDevice device={device}>{plan.onDevice}</OnDevice> : null}
      </div>
    </SheetPanel>
  );
}
