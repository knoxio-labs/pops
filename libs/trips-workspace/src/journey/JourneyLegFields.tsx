import { Select, Textarea, TextInput } from '@pops/ui';

import { SourceReferences } from './SourceReferences';

import type { JSX } from 'react';

import type { JourneyLeg, LegPatch } from './types';

/** Explicit leg edit callbacks shared by source metadata sections. */
export interface JourneyLegFieldsProps {
  leg: JourneyLeg;
  edit: (patch: LegPatch) => void;
  save: (patch: LegPatch) => void;
}

/** Published intention, arrangement and purchase axes remain independent. */
export function JourneyLegStatus({ leg, save }: JourneyLegFieldsProps): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Select
        label="Intention"
        value={leg.intention ?? ''}
        options={choiceOptions(intentionLabels)}
        onChange={(event) => {
          const value = event.target.value;
          if (
            value === '' ||
            value === 'In plan' ||
            value === 'Considering' ||
            value === 'Alternative'
          )
            save({ intention: value || null });
        }}
      />
      <Select
        label="Arrangement"
        value={leg.arrangement ?? ''}
        options={choiceOptions(arrangementLabels)}
        onChange={(event) => {
          const value = event.target.value;
          if (
            value === '' ||
            value === 'Booked' ||
            value === 'Agreed' ||
            value === 'Not arranged' ||
            value === 'Not needed'
          )
            save({ arrangement: value || null });
        }}
      />
      <Select
        label="Purchase"
        value={leg.purchase ?? ''}
        options={choiceOptions(purchaseLabels)}
        onChange={(event) =>
          save({ purchase: event.target.value === 'Purchased' ? 'Purchased' : null })
        }
      />
    </div>
  );
}

/** Independently captured operator/reference/provenance source fields. */
export function JourneyLegMetadata({ leg, edit, save }: JourneyLegFieldsProps): JSX.Element {
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm">
        Operator, reference and sources
      </summary>
      <div className="space-y-3">
        {(['operator', 'service', 'reference'] as const).map((field) => (
          <TextInput
            key={field}
            label={field === 'service' ? 'Service number' : field}
            value={leg[field] ?? ''}
            onChange={(event) =>
              edit({
                [field]: event.target.value || null,
              })
            }
            onBlur={() => save({ [field]: leg[field] })}
          />
        ))}
        <label className="block space-y-2 text-sm">
          Leg notes
          <Textarea
            value={leg.notes}
            onChange={(event) => edit({ notes: event.target.value })}
            onBlur={() => save({ notes: leg.notes })}
          />
        </label>
        <SourceReferences links={leg.sourceLinks} save={(sourceLinks) => save({ sourceLinks })} />
      </div>
    </details>
  );
}

const intentionLabels = {
  'In plan': 'In plan',
  Considering: 'Considering',
  Alternative: 'Alternative',
} satisfies Record<NonNullable<JourneyLeg['intention']>, string>;
const arrangementLabels = {
  Booked: 'Booked',
  Agreed: 'Agreed',
  'Not arranged': 'Not arranged',
  'Not needed': 'Not needed',
} satisfies Record<NonNullable<JourneyLeg['arrangement']>, string>;
const purchaseLabels = { Purchased: 'Purchased' } satisfies Record<
  NonNullable<JourneyLeg['purchase']>,
  string
>;

function choiceOptions(labels: Record<string, string>): { value: string; label: string }[] {
  return [
    { value: '', label: 'Not recorded' },
    ...Object.entries(labels).map(([value, label]) => ({ value, label })),
  ];
}
