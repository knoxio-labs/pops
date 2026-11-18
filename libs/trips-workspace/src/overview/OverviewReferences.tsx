import { dateLabel } from './model';
import { OverviewDocuments } from './OverviewDocuments';
import { sourceAction } from './source-action';
import { SourceCard } from './SourceCard';
import { workspaceRecordVisible } from './workspace-projection';

import type { JSX } from 'react';

import type { OverviewViewProps } from './types';

/** Decisions and document associations retain independent source identities and contextual opening. */
export function OverviewReferences(props: OverviewViewProps): JSX.Element {
  return (
    <div className="min-w-0 space-y-6">
      <DecisionReferences {...props} />
      <OverviewDocuments {...props} />
    </div>
  );
}

function DecisionReferences(props: OverviewViewProps): JSX.Element | null {
  const decisions = (props.sources.decisions ?? []).filter((decision) =>
    workspaceRecordVisible(props, {
      text: [
        decision.question,
        decision.notes,
        decision.deadline,
        decision.selectedOptionId === null ? 'unresolved' : 'selected',
        props.labels.source('decision', decision.id),
      ],
      needsAttention: decision.selectedOptionId === null,
    })
  );
  if (!decisions.length) return null;
  return (
    <section aria-label={props.labels.decisions} className="space-y-3">
      <h2 className="border-b pb-2 text-lg font-semibold">{props.labels.decisions}</h2>
      {decisions.map((decision) => (
        <SourceCard
          key={decision.id}
          kind="decision"
          title={decision.question || props.labels.source('decision', decision.id)}
          {...sourceAction(props, { kind: 'decision', id: decision.id })}
          labels={props.labels}
          statuses={[decision.selectedOptionId === null ? 'unresolved' : 'selected']}
          compact
        >
          {decision.deadline && (
            <span className="block">{dateLabel(decision.deadline, props.locale)}</span>
          )}
        </SourceCard>
      ))}
    </section>
  );
}
