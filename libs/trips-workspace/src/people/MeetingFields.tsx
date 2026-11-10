import { MeetingChoices } from './MeetingChoices';
import { MeetingField } from './MeetingField';

import type { JSX } from 'react';

import type { Place, Visit } from '../stay/types';
import type { PeopleEditor } from './editor';
import type { MeetingPatch, MeetingPlan, PeopleText } from './types';

/** Independent editable meeting facts; Visit labels retain occurrence identity and dates never auto-fill. */
export function MeetingFields({
  plan,
  visits,
  places,
  text,
  save,
  editor,
}: {
  plan: MeetingPlan;
  visits: Visit[];
  places: Place[];
  text: PeopleText;
  save: (patch: MeetingPatch) => void;
  editor: PeopleEditor;
}): JSX.Element {
  return (
    <div className="space-y-3">
      <MeetingField
        editor={editor}
        fieldKey={`${plan.id}:title`}
        value={plan.title}
        label={text('planTitle')}
        save={(title) => save({ title })}
      />
      <MeetingChoices {...{ plan, visits, places, text, save }} />
      <div className="grid gap-3 sm:grid-cols-2">
        <MeetingField
          date
          editor={editor}
          fieldKey={`${plan.id}:startDate`}
          value={plan.startDate ?? ''}
          label={text('startDate')}
          save={(value) => save({ startDate: value || null })}
        />
        <MeetingField
          date
          editor={editor}
          fieldKey={`${plan.id}:endDate`}
          value={plan.endDate ?? ''}
          label={text('endDate')}
          save={(value) => save({ endDate: value || null })}
        />
      </div>
      {plan.startDate !== null && plan.endDate !== null && plan.startDate > plan.endDate && (
        <p role="status" className="text-sm text-warning">
          {text('reversedDates')}
        </p>
      )}
      <MeetingField
        multiline
        editor={editor}
        fieldKey={`${plan.id}:notes`}
        value={plan.notes}
        label={text('notes')}
        save={(notes) => save({ notes })}
      />
    </div>
  );
}
