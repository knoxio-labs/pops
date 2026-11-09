import { Card, cn } from '@pops/ui';

import { calendarStamp } from '../trip-calendar/format';
import { arrangementCostLabel, arrangementDateLabel } from './format';
import { ArrangementKindIcon } from './kind-icon';
import { groupArrangements } from './model';
import { ArrangementSource } from './source';
import { ArrangementStateLabels } from './state-labels';

import type { ArrangementRow, ArrangementState } from './model';

/** Groups identical matching arrangements by explicit route context or source kind. */
export function ArrangementResults({
  state,
  rows,
  layout,
}: {
  state: ArrangementState;
  rows: ArrangementRow[];
  layout: 'route' | 'kinds';
}) {
  if (!rows.length)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        No matching arrangements
      </p>
    );
  return (
    <section aria-label="Arrangements" className="space-y-4">
      {groupArrangements(state, rows, layout).map((group) => (
        <section key={group.id} aria-label={group.name} className="space-y-2">
          <h2 className="flex items-baseline gap-2 text-base font-medium">
            <span>{group.name}</span>
            <span className="text-xs text-muted-foreground">{group.rows.length}</span>
          </h2>
          <Card className="gap-0 overflow-hidden border-border py-0 shadow-none">
            <div className="divide-y divide-border">
              {group.rows.map((row) => (
                <ArrangementListRow key={row.id} row={row} />
              ))}
            </div>
          </Card>
        </section>
      ))}
    </section>
  );
}

function ArrangementListRow({ row }: { row: ArrangementRow }) {
  return (
    <article
      aria-label={row.name}
      className={cn(
        'border-l-2',
        row.purchased ? 'border-solid border-l-app-accent' : 'border-dashed border-l-border'
      )}
    >
      <ArrangementSource row={row}>
        <span className="flex items-start gap-3">
          <span className="pt-1">
            <ArrangementKindIcon
              kind={row.kind}
              flight={row.bookings.some((booking) => booking.kind === 'flight')}
            />
          </span>
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-sm font-medium text-foreground">{row.name}</span>
              <span className="text-xs text-muted-foreground">{arrangementDateLabel(row)}</span>
            </span>
            <ArrangementStateLabels row={row} />
            {row.responsible && (
              <span className="block text-xs text-muted-foreground">
                Handled by {row.responsible.label}
              </span>
            )}
            <ArrangementPolicySummary row={row} />
          </span>
        </span>
      </ArrangementSource>
    </article>
  );
}

function ArrangementPolicySummary({ row }: { row: ArrangementRow }) {
  const policy = row.policy;
  if (!policy) return null;
  const facts = [
    policy.cancellation
      ? `Cancellation deadline ${calendarStamp(policy.cancellation.at, policy.cancellation.timeZone)}`
      : '',
    policy.changeCost ? `Change cost ${arrangementCostLabel(policy.changeCost)}` : '',
  ].filter(Boolean);
  return facts.length ? (
    <span className="mt-1 block text-xs text-muted-foreground">{facts.join(' · ')}</span>
  ) : null;
}
