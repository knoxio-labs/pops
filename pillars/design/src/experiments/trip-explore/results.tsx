import { Card } from '@pops/ui';

import { ExploreEditor } from './editor';
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
    <section aria-label="Possibilities" className="space-y-4">
      {layout === 'collection' ? (
        <ExploreList records={records} showLocation />
      ) : (
        groupExploreRecords(records).map((group) => (
          <section key={group.id} aria-label={group.name} className="space-y-2">
            <h2 className="flex items-baseline gap-2 text-base font-medium">
              <span>{group.name}</span>
              <span className="text-xs font-normal text-muted-foreground">
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
    <Card className="gap-0 overflow-hidden border-border py-0 shadow-none">
      <div className="divide-y divide-border">
        {records.map((record) => (
          <ExploreRow key={record.id} record={record} showLocation={showLocation} />
        ))}
      </div>
    </Card>
  );
}

function ExploreRow({ record, showLocation }: { record: ExploreRecord; showLocation: boolean }) {
  const facts = exploreFacts(record);
  const meta = [showLocation && facts.cityId ? facts.city : '', facts.timing].filter(Boolean);
  return (
    <article aria-label={facts.name}>
      <ExploreEditor record={record}>
        <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-sm font-medium text-foreground">{facts.name}</span>
          <span className="text-xs text-muted-foreground">{meta.join(' · ')}</span>
        </span>
      </ExploreEditor>
    </article>
  );
}
