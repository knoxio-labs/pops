import { ComboboxSelect, Textarea, TextInput } from '@pops/ui';

import { meetingAgreements, meetingIntentions, MeetingVisit } from './fields';

import type { TripPersonPlan } from './model';

/** Edits only explicit meeting fields; optional dates are never filled from contact availability. */
export function MeetingFields({
  plan,
  change,
}: {
  plan: TripPersonPlan;
  change: (next: TripPersonPlan) => void;
}) {
  return (
    <>
      <TextInput
        label="Meeting plan"
        value={plan.title}
        onChange={(event) => change({ ...plan, title: event.currentTarget.value })}
      />
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Visit</span>
        <MeetingVisit value={plan.visitId} change={(visitId) => change({ ...plan, visitId })} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MeetingIntentFields plan={plan} change={change} />
        <TextInput
          label="Meeting from"
          type="date"
          value={plan.from}
          onChange={(event) => change({ ...plan, from: event.currentTarget.value })}
        />
        <TextInput
          label="Meeting through"
          type="date"
          value={plan.to}
          onChange={(event) => change({ ...plan, to: event.currentTarget.value })}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="meeting-notes" className="text-xs text-muted-foreground">
          Meeting notes
        </label>
        <Textarea
          id="meeting-notes"
          value={plan.notes}
          onChange={(event) => change({ ...plan, notes: event.currentTarget.value })}
        />
      </div>
    </>
  );
}

function MeetingIntentFields({
  plan,
  change,
}: {
  plan: TripPersonPlan;
  change: (next: TripPersonPlan) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Intent</span>
        <ComboboxSelect
          aria-label="Intent"
          value={plan.intention}
          options={meetingIntentions}
          onChange={(intention) => {
            if (intention === 'Considering' || intention === 'Planned')
              change({ ...plan, intention });
          }}
        />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Agreement</span>
        <ComboboxSelect
          aria-label="Agreement"
          value={plan.agreement}
          options={meetingAgreements}
          onChange={(agreement) => {
            if (agreement === 'Agreed' || agreement === 'Not agreed')
              change({ ...plan, agreement });
          }}
        />
      </div>
    </>
  );
}
