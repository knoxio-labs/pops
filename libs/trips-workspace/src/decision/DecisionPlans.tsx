import { Button } from '@pops/ui';

import { planLabel } from './use-decision-context';

import type { JSX } from 'react';

import type { AffectedSource } from './types';
import type { DecisionPlan } from './use-decision-context';

/** Edit exact source memberships independently of selection and other retained unavailable references. */
export function DecisionPlans({
  sources,
  plans,
  save,
}: {
  sources: AffectedSource[];
  plans: DecisionPlan[];
  save: (sources: AffectedSource[]) => void;
}): JSX.Element {
  return (
    <div className="space-y-2">
      {sources.map((source) => (
        <div
          className="flex flex-wrap items-center justify-between gap-2"
          key={`${source.kind}/${source.id}`}
        >
          <span className="text-sm">
            {planLabel(source, plans)}
            {!plans.some((plan) => plan.kind === source.kind && plan.id === source.id) &&
              ' · Source unavailable'}
          </span>
          <Button
            variant="ghost"
            onClick={() =>
              save(sources.filter((item) => item.kind !== source.kind || item.id !== source.id))
            }
            aria-label={`Unlink ${source.kind} ${source.id}`}
          >
            Unlink
          </Button>
        </div>
      ))}
      <details>
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
          Link affected plans
        </summary>
        <div className="flex flex-wrap gap-2">
          {plans
            .filter(
              (plan) =>
                !sources.some((source) => source.kind === plan.kind && source.id === plan.id)
            )
            .map((plan) => (
              <Button
                variant="outline"
                key={`${plan.kind}/${plan.id}`}
                onClick={() => save([...sources, { kind: plan.kind, id: plan.id }])}
              >
                Link {planLabel(plan, plans)}
              </Button>
            ))}
        </div>
      </details>
    </div>
  );
}
