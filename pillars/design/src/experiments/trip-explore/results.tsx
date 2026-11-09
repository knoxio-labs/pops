import { ExploreEditor } from './editor';
import { exploreKindOptions, explorePurposeLabel } from './fields';
import { exploreFacts, groupExploreRecords } from './model';

import type { ExploreRecord } from './model';

/** Shows the same matching records in one collection or explicit source-location groups. */
export function ExploreResults({
  records,
  layout,
}: {
  records: ExploreRecord[];
  layout: 'collection' | 'cities';
}) {
  if (!records.length)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        No matching possibilities
      </p>
    );
  return (
    <section aria-label="Possibilities" className="space-y-5">
      {layout === 'collection' ? (
        <ExploreList records={records} showLocation />
      ) : (
        groupExploreRecords(records).map((group) => (
          <section key={group.id} aria-label={group.name} className="space-y-2">
            <h2 className="flex items-baseline justify-between gap-2 text-base font-semibold">
              <span>{group.name}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {group.records.length}
              </span>
            </h2>
            <ExploreList records={group.records} showLocation={false} />
          </section>
        ))
      )}
    </section>
  );
}

function ExploreList({
  records,
  showLocation,
}: {
  records: ExploreRecord[];
  showLocation: boolean;
}) {
  return (
    <div className="divide-y divide-foreground/15 overflow-hidden rounded-xl border border-foreground/25 bg-muted/20">
      {records.map((record) => (
        <ExploreRow key={record.id} record={record} showLocation={showLocation} />
      ))}
    </div>
  );
}

function ExploreRow({ record, showLocation }: { record: ExploreRecord; showLocation: boolean }) {
  const facts = exploreFacts(record);
  const kind =
    exploreKindOptions.find((option) => option.value === facts.kind)?.label ?? facts.kind;
  const meta = [
    kind,
    facts.status,
    explorePurposeLabel(facts.purpose),
    showLocation && facts.cityId ? facts.city : '',
    facts.timing,
  ].filter(Boolean);
  return (
    <article aria-label={facts.name}>
      <ExploreEditor record={record}>
        <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-sm font-semibold text-foreground">{facts.name}</span>
          <span className="text-xs text-muted-foreground">{meta.join(' · ')}</span>
        </span>
        {facts.notes && (
          <span className="mt-1 block line-clamp-2 text-sm text-muted-foreground">
            {facts.notes}
          </span>
        )}
        {record.source === 'idea' && record.idea.recommendations.length > 0 && (
          <span className="mt-1 block text-xs text-muted-foreground">
            {recommendationNames(record).join(' · ')}
          </span>
        )}
      </ExploreEditor>
    </article>
  );
}

function recommendationNames(record: Extract<ExploreRecord, { source: 'idea' }>) {
  return record.idea.recommendations.flatMap((recommendation) =>
    recommendation.contactId
      ? [
          record.idea.contacts.find((contact) => contact.id === recommendation.contactId)?.name ??
            'Recommender unavailable',
        ]
      : []
  );
}
