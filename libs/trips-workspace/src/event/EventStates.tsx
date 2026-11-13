import { Select } from '@pops/ui';

import type { JSX } from 'react';

import type { EventFieldProps, TripEvent } from './types';
/** Independent source states; recording purchase never changes intention or arrangement. */
export function EventStates({ event, commit }: EventFieldProps): JSX.Element {
  return (
    <div className="grid gap-3 @lg:grid-cols-3">
      <Select
        label="Intention"
        value={event.intention ?? ''}
        options={options(intentions)}
        onChange={(e) =>
          commit({ intention: intentions.find((value) => value === e.target.value) ?? null })
        }
        className="min-h-11 min-w-0 w-full"
        containerClassName="min-w-0"
      />
      <Select
        label="Arrangement"
        value={event.arrangement ?? ''}
        options={options(arrangements)}
        onChange={(e) =>
          commit({ arrangement: arrangements.find((value) => value === e.target.value) ?? null })
        }
        className="min-h-11 min-w-0 w-full"
        containerClassName="min-w-0"
      />
      <Select
        label="Purchase"
        value={event.purchase ?? ''}
        options={options(purchases)}
        onChange={(e) =>
          commit({ purchase: purchases.find((value) => value === e.target.value) ?? null })
        }
        className="min-h-11 min-w-0 w-full"
        containerClassName="min-w-0"
      />
    </div>
  );
}
const intentions = ['In plan', 'Considering', 'Alternative'] satisfies NonNullable<
  TripEvent['intention']
>[];
const arrangements = ['Booked', 'Agreed', 'Not arranged', 'Not needed'] satisfies NonNullable<
  TripEvent['arrangement']
>[];
const purchases = ['Purchased'] satisfies NonNullable<TripEvent['purchase']>[];
function options(values: readonly string[]): { value: string; label: string }[] {
  return [
    { value: '', label: 'Not recorded' },
    ...values.map((value) => ({ value, label: value })),
  ];
}
