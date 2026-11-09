import { ComboboxSelect } from '@pops/ui';

import { shortArrangementDates } from '../trip-arrangements/format';
import { useTripPeople } from './context';

/** Explicit meeting intentions remain separate from agreement and availability evidence. */
export const meetingIntentions = [
  { value: 'Considering', label: 'Considering' },
  { value: 'Planned', label: 'Planned' },
];
/** Agreement changes only the local meeting record; it does not create a timed commitment. */
export const meetingAgreements = [
  { value: 'Not agreed', label: 'Not agreed' },
  { value: 'Agreed', label: 'Agreed' },
];

/** Selects an explicit route visit, retaining a missing reference until it is replaced or cleared. */
export function MeetingVisit({
  value,
  change,
  filter = false,
}: {
  value: string;
  change: (value: string) => void;
  filter?: boolean;
}) {
  const { state } = useTripPeople();
  const options = [
    { value: '', label: filter ? 'All visits' : 'No visit' },
    ...state.visits.map((visit) => ({
      value: visit.id,
      label: [visit.name, shortArrangementDates([visit.from, visit.to].filter(Boolean))]
        .filter(Boolean)
        .join(' · '),
    })),
  ];
  if (value && !state.visits.some((visit) => visit.id === value))
    options.push({ value, label: 'Visit unavailable' });
  return (
    <ComboboxSelect
      aria-label={filter ? 'Filter visit' : 'Visit'}
      value={value}
      options={options}
      placeholder={filter ? 'All visits' : 'No visit'}
      onChange={(next) => {
        if (typeof next === 'string') change(next);
      }}
    />
  );
}
