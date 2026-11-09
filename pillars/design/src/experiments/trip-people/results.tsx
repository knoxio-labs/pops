import { Card } from '@pops/ui';

import { shortArrangementDates } from '../trip-arrangements/format';
import { TripPersonAvatar } from './identity';
import { groupPeopleRows } from './model';
import { TripPeopleSource } from './source';
import { MeetingFindings, MeetingStatus } from './status';

import type { PeopleRow, TripPeopleState } from './model';

/** Shows identical people and meeting records under route visits or individual source identities. */
export function TripPeopleResults({
  state,
  rows,
  layout,
}: {
  state: TripPeopleState;
  rows: PeopleRow[];
  layout: 'route' | 'people';
}) {
  if (!rows.length)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        No matching people or plans
      </p>
    );
  return (
    <section aria-label="Trip people" className="space-y-4">
      {groupPeopleRows(state, rows, layout).map((group) => (
        <section key={group.id} aria-label={group.name} className="space-y-2">
          <PeopleGroupHeading name={group.name} rows={group.rows} byPerson={layout === 'people'} />
          <Card className="gap-0 overflow-hidden border-border py-0 shadow-none">
            <div className="divide-y divide-border">
              {group.rows.map((row) => (
                <MeetingRow
                  key={row.id}
                  row={row}
                  byPerson={layout === 'people'}
                  identityMethod={disambiguatingMethod(state, row)}
                />
              ))}
            </div>
          </Card>
        </section>
      ))}
    </section>
  );
}

function PeopleGroupHeading({
  name,
  rows,
  byPerson,
}: {
  name: string;
  rows: PeopleRow[];
  byPerson: boolean;
}) {
  const first = rows[0];
  const dates = first?.visit
    ? shortArrangementDates([first.visit.from, first.visit.to].filter(Boolean))
    : '';
  return (
    <header className="flex items-center gap-3">
      {byPerson && <TripPersonAvatar name={name} available={Boolean(first?.contact)} />}
      <div className="min-w-0">
        <h2 className="flex items-baseline gap-2 text-base font-medium">
          <span>{name}</span>
          <span className="text-xs text-muted-foreground">{rows.length}</span>
        </h2>
        {byPerson
          ? first?.contact?.person.methods[0] && (
              <p className="break-words text-xs text-muted-foreground">
                {first.contact.person.methods[0].value}
              </p>
            )
          : dates && <p className="text-xs text-muted-foreground">{dates}</p>}
      </div>
    </header>
  );
}

function MeetingRow({
  row,
  byPerson,
  identityMethod,
}: {
  row: PeopleRow;
  byPerson: boolean;
  identityMethod?: string;
}) {
  const dates = shortArrangementDates([row.plan.from, row.plan.to].filter(Boolean));
  const title = byPerson ? row.plan.title || row.personName : row.personName;
  const secondary = byPerson ? row.visitLabel : row.plan.title;
  return (
    <article aria-label={[row.personName, row.plan.title].filter(Boolean).join(' · ')}>
      <TripPeopleSource row={row}>
        <span className="flex items-start gap-3">
          {!byPerson && <TripPersonAvatar name={row.personName} available={Boolean(row.contact)} />}
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-foreground">{title}</span>
              {dates && <span className="text-xs text-muted-foreground">{dates}</span>}
            </span>
            {!byPerson && identityMethod && (
              <span className="block break-words text-xs text-muted-foreground">
                {identityMethod}
              </span>
            )}
            {secondary && <span className="block text-sm text-muted-foreground">{secondary}</span>}
            <MeetingStatus row={row} />
            <MeetingFindings row={row} />
          </span>
        </span>
      </TripPeopleSource>
    </article>
  );
}

function disambiguatingMethod(state: TripPeopleState, row: PeopleRow): string | undefined {
  return row.contact &&
    state.contacts.some(
      (contact) => contact.id !== row.contact?.id && contact.person.name === row.personName
    )
    ? row.contact.person.methods[0]?.value
    : undefined;
}
