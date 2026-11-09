import { TextInput } from '@pops/ui';

import { changeTiming } from './model';

import type { JSX } from 'react';

import type { Stay, StayFieldProps } from './types';

/** Individual date/time/zone controls send a complete timing value without copying visit facts. */
export function StayTimingFields(props: StayFieldProps): JSX.Element {
  return (
    <>
      <div className="grid gap-3 sm:max-lg:grid-cols-2 lg:grid-cols-4">
        <TimingField {...props} field="arrival" label="Check-in date" type="date" />
        <TimingField {...props} field="checkIn" label="Check-in time" type="time" />
        <TimingField {...props} field="departure" label="Check-out date" type="date" />
        <TimingField {...props} field="checkOut" label="Check-out time" type="time" />
      </div>
      <TimingField {...props} field="timeZone" label="Time zone" type="text" />
    </>
  );
}

function TimingField({
  stay,
  field,
  label,
  type,
  edit,
  commit,
}: StayFieldProps & {
  field: keyof Stay['timing'];
  label: string;
  type: 'date' | 'time' | 'text';
}): JSX.Element {
  return (
    <TextInput
      label={label}
      type={type}
      value={stay.timing[field] ?? ''}
      className="min-h-11"
      onChange={(event) => edit({ timing: changeTiming(stay.timing, field, event.target.value) })}
      onBlur={(event) =>
        commit({ timing: changeTiming(stay.timing, field, event.currentTarget.value) })
      }
    />
  );
}
