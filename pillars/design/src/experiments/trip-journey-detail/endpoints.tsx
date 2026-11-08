import { TextInput } from '@pops/ui';

import { useJourney } from './context';
import { legLabel } from './display';
import { JourneyLocationPicker } from './location';
import { updateLeg } from './model';

import type { JourneyEndpoint, JourneyLeg, JourneyState } from './model';

/** Edit explicit local clocks and IANA zones, retaining invalid or incomplete source for correction. */
export function JourneyEndpoints({ leg }: { leg: JourneyLeg }) {
  const { state, change } = useJourney();
  const update = (side: 'from' | 'to', endpoint: JourneyEndpoint, source: JourneyState = state) =>
    change(updateLeg(source, { ...leg, [side]: endpoint }));
  return (
    <div className="space-y-2">
      {(['from', 'to'] as const).map((side) => {
        const endpoint = leg[side];
        const label = side === 'from' ? 'Departure' : 'Arrival';
        return (
          <div
            key={side}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-foreground/15 pt-2"
          >
            <JourneyLocationPicker
              label={`${label} location · ${legLabel(state, leg)}`}
              endpoint={endpoint}
              change={(next, source) => update(side, next, source)}
            />
            <div className="w-64 max-w-full">
              <TextInput
                type="datetime-local"
                aria-label={`${label} time · ${legLabel(state, leg)}`}
                variant="ghost"
                containerClassName="bg-transparent"
                key={`${leg.id}-${side}-${endpoint.local}`}
                defaultValue={endpoint.local}
                onBlur={(event) => {
                  if (event.currentTarget.value !== endpoint.local)
                    update(side, { ...endpoint, local: event.currentTarget.value });
                }}
              />
            </div>
            <div className="w-48 max-w-full">
              <TextInput
                aria-label={`${label} time zone · ${legLabel(state, leg)}`}
                placeholder="Time zone"
                variant="ghost"
                containerClassName="bg-transparent"
                key={`${leg.id}-${side}-${endpoint.timeZone}`}
                defaultValue={endpoint.timeZone}
                onBlur={(event) => {
                  if (event.currentTarget.value !== endpoint.timeZone)
                    update(side, { ...endpoint, timeZone: event.currentTarget.value.trim() });
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
