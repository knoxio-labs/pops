import { Select } from '@pops/ui';

import type { JSX } from 'react';

import type { Place, Visit } from '../stay/types';
import type { MeetingPatch, MeetingPlan, PeopleText } from './types';
/** Explicit Visit, intention and agreement choices never infer one another. */
export function MeetingChoices({
  plan,
  visits,
  places,
  text,
  save,
}: {
  plan: MeetingPlan;
  visits: Visit[];
  places: Place[];
  text: PeopleText;
  save: (patch: MeetingPatch) => void;
}): JSX.Element {
  const options = visitOptions(plan, visits, places, text);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Select
        label={text('visit')}
        className="min-h-11"
        value={plan.visitId === null ? '' : String(plan.visitId)}
        options={[{ value: '', label: text('unassociated') }, ...options]}
        onChange={(event) =>
          save({ visitId: event.target.value ? Number(event.target.value) : null })
        }
      />
      <Select
        label={text('intention')}
        className="min-h-11"
        value={plan.intention}
        options={(['Considering', 'Planned'] as const).map((value) => ({
          value,
          label: text(value),
        }))}
        onChange={(event) => {
          const intention = event.target.value;
          if (intention === 'Considering' || intention === 'Planned') save({ intention });
        }}
      />
      <Select
        label={text('agreement')}
        className="min-h-11"
        value={plan.agreement}
        options={(['Not agreed', 'Agreed'] as const).map((value) => ({
          value,
          label: text(value),
        }))}
        onChange={(event) => {
          const agreement = event.target.value;
          if (agreement === 'Not agreed' || agreement === 'Agreed') save({ agreement });
        }}
      />
    </div>
  );
}

function visitOptions(
  plan: MeetingPlan,
  visits: Visit[],
  places: Place[],
  text: PeopleText
): { value: string; label: string }[] {
  const options = visits.map((visit, index) => ({
    value: String(visit.id),
    label: `${index + 1}. ${places.find((place) => place.id === visit.placeId)?.name ?? text('placeUnavailable')} · #${visit.id}`,
  }));
  if (plan.visitId !== null && !visits.some((visit) => visit.id === plan.visitId))
    options.push({
      value: String(plan.visitId),
      label: text('visitUnavailable', { id: plan.visitId }),
    });
  return options;
}
