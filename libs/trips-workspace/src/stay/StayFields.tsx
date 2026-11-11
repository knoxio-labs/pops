import { Textarea, TextInput } from '@pops/ui';

import { StaySelectors } from './StaySelectors';
import { StayTimingFields } from './StayTimingFields';

import type { JSX } from 'react';

import type { StayFieldProps, Visit, Place } from './types';

/** Editable source facts; timing controls remain independent and unknown values stay blank. */
export function StayFields(
  props: StayFieldProps & { visits: Visit[]; places: Place[] }
): JSX.Element {
  const { stay, edit, commit } = props;
  return (
    <div className="@container space-y-4">
      <TextInput
        label="Stay name"
        value={stay.name ?? ''}
        onChange={(event) => edit({ name: event.target.value || null })}
        onBlur={(event) => commit({ name: event.currentTarget.value || null })}
        className="min-h-11"
      />
      <StaySelectors {...props} />
      <StayTimingFields {...props} />
      <TextInput
        label="Address"
        value={stay.address ?? ''}
        onChange={(event) => edit({ address: event.target.value || null })}
        onBlur={(event) => commit({ address: event.currentTarget.value || null })}
        className="min-h-11"
      />
      <details>
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
          Reference and notes
        </summary>
        <div className="space-y-3 pt-2">
          <TextInput
            label="Booking reference"
            value={stay.reference ?? ''}
            onChange={(event) => edit({ reference: event.target.value || null })}
            onBlur={(event) => commit({ reference: event.currentTarget.value || null })}
            className="min-h-11"
          />
          <label className="block space-y-2 text-sm">
            Stay notes
            <Textarea
              value={stay.notes}
              onChange={(event) => edit({ notes: event.target.value })}
              onBlur={(event) => commit({ notes: event.currentTarget.value })}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
