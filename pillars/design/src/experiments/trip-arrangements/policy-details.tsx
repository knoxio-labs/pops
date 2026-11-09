import { calendarStamp } from '../trip-calendar/format';
import { arrangementCostLabel } from './format';
import { policyFindings } from './model';

import type { ArrangementPolicy } from './model';

/** Shows only explicit policy facts; missing costs and cancellation terms imply no promise. */
export function ArrangementPolicyDetails({ policy }: { policy: ArrangementPolicy }) {
  const findings = policyFindings(policy);
  return (
    <section aria-label="Policy source" className="space-y-3 border-t border-border pt-3">
      <dl className="space-y-2 text-sm">
        {policy.source && <PolicyFact label="Source" value={policy.source} />}
        {policy.changeCost && (
          <PolicyFact label="Change cost" value={arrangementCostLabel(policy.changeCost)} />
        )}
        {policy.cancellation && (
          <PolicyFact
            label="Cancellation deadline"
            value={calendarStamp(policy.cancellation.at, policy.cancellation.timeZone)}
          />
        )}
        {policy.notes && <PolicyFact label="Policy notes" value={policy.notes} />}
      </dl>
      {findings.map((finding) => (
        <p key={finding.id} className="text-sm text-destructive">
          {finding.message}
        </p>
      ))}
    </section>
  );
}

function PolicyFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
