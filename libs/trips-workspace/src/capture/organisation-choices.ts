import type { CaptureSource, CaptureTargetInput } from './types';

/** One exact typed target option, independent of its optional display name. */
export type Choice = { value: string; label: string; target: CaptureTargetInput };

function targetChoices(source: CaptureSource): Choice[] {
  return [
    ...source.ideas
      .filter((row) => row.removedAt === null)
      .map((row): Choice => ({
        value: `idea:${row.id}`,
        label: `Idea ${row.id}${row.name ? `: ${row.name}` : ''}`,
        target: { mode: 'existing', target: { kind: 'idea', id: row.id } },
      })),
    ...source.events.map((row): Choice => ({
      value: `event:${row.id}`,
      label: `Event ${row.id}${row.name ? `: ${row.name}` : ''}`,
      target: { mode: 'existing', target: { kind: 'event', id: row.id } },
    })),
    ...source.journeys.map((row): Choice => ({
      value: `journey:${row.id}`,
      label: `Journey ${row.id}${row.name ? `: ${row.name}` : ''}`,
      target: { mode: 'existing', target: { kind: 'journey', id: row.id } },
    })),
    ...source.stays.map((row): Choice => ({
      value: `stay:${row.id}`,
      label: `Stay ${row.id}${row.name ? `: ${row.name}` : ''}`,
      target: { mode: 'existing', target: { kind: 'stay', id: row.id } },
    })),
    { value: 'createIdea', label: 'Create Idea', target: { mode: 'createIdea', input: {} } },
    { value: 'createEvent', label: 'Create Event', target: { mode: 'createEvent', input: {} } },
    {
      value: 'createJourney',
      label: 'Create Journey',
      target: { mode: 'createJourney', input: {} },
    },
    { value: 'createStay', label: 'Create Stay', target: { mode: 'createStay', input: {} } },
  ];
}

/** Match only an explicitly retained finite target; labels never resolve an identity. */
export function selectedValue(selected: CaptureTargetInput, choices: Choice[]): string {
  if (selected === undefined) return '';
  if (selected.mode !== 'existing') return selected.mode;
  return (
    choices.find((choice) => JSON.stringify(choice.target) === JSON.stringify(selected))?.value ??
    ''
  );
}
/** Existing typed targets and explicit create actions from the published producer contract. */
export function organisationChoices(source: CaptureSource, selected: CaptureTargetInput): Choice[] {
  const choices = targetChoices(source);
  if (selected?.mode === 'existing' && selected.target.kind === 'contact')
    choices.push({
      value: 'selected-contact',
      label: 'Selected Contacts reference',
      target: selected,
    });
  return choices;
}
