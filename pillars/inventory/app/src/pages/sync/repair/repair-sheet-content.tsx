import { Smartphone } from 'lucide-react';

import { SheetSection } from '../sheet-section.js';
import { RepairEvidence } from './repair-evidence.js';

import type { ReactElement, ReactNode } from 'react';

import type { RepairCase } from '../sync-model.js';
import type { RepairPlan } from './repair-plan.js';
import type { RepairActions } from './use-repair-actions.js';

/** Explains the remaining device-side work for a Sync case. */
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

/** Renders the evidence and explanatory content inside a repair sheet. */
export function RepairContent({
  repair,
  device,
  now,
  plan,
  actions,
}: {
  repair: RepairCase;
  device: string;
  now: string;
  plan: RepairPlan;
  actions: RepairActions;
}): ReactElement {
  return (
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
  );
}
