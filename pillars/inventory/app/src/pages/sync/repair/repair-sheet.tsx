import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button, ButtonPrimitive, SheetPanel } from '@pops/ui';

import { HintTooltip } from '../../../foundation/shortcuts/hint-tooltip.js';
import { useShortcutScope } from '../../../foundation/shortcuts/shortcut-provider.js';
import { SettledSheet } from '../outcome-sheets.js';
import { planFor } from './repair-plan.js';
import { RepairContent } from './repair-sheet-content.js';
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

function RepairFooter({
  plan,
  actions,
  position,
  onStep,
}: {
  plan: ReturnType<typeof planFor>;
  actions: ReturnType<typeof useRepairActions>;
  position: CasePosition | null;
  onStep: (caseId: string) => void;
}): ReactElement {
  return (
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

  if (actions.outcome !== null) {
    const nextId = position?.nextId ?? null;
    return (
      <SettledSheet
        entry={actions.outcome}
        device={device}
        now={now}
        remaining={position === null ? 0 : Math.max(0, position.total - position.index - 1)}
        onClose={onClose}
        onNext={nextId === null ? undefined : () => onStep(nextId)}
      />
    );
  }

  return (
    <SheetPanel
      title={repair.itemName}
      description={repair.problem}
      onClose={onClose}
      className="rounded-xl"
      footer={<RepairFooter plan={plan} actions={actions} position={position} onStep={onStep} />}
    >
      <RepairContent repair={repair} device={device} now={now} plan={plan} actions={actions} />
    </SheetPanel>
  );
}
