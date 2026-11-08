import { useState } from 'react';

import { AddTransport } from './add-transport';
import { JourneyContext } from './context';
import { JourneyDocuments } from './documents';
import { JourneyFindings } from './findings';
import { JourneyLegs } from './legs';
import { updateJourneyOption } from './option-model';
import { useJourneyOptions } from './options-context';
import { JourneySettings } from './settings';

import type { JourneyLeg, JourneyState } from './model';
import type { JourneyOption } from './option-model';

/** Reuse journey controls while keeping alternative edits separate from the current journey. */
export function JourneyOptionEditor({ option }: { option: JourneyOption }) {
  const { state, change } = useJourneyOptions();
  const [legs, previewLegs] = useState<JourneyLeg[] | null>(null);
  const actions = {
    state: option.journey,
    preview: legs ? { ...option.journey, legs } : option.journey,
    change: (journey: JourneyState) => change(updateJourneyOption(state, option.id, journey)),
    previewLegs,
  };
  return (
    <JourneyContext.Provider value={actions}>
      <div className="space-y-3 border-t pt-3" role="region" aria-label="Edit alternative journey">
        <JourneyFindings />
        <JourneyLegs />
        <AddTransport />
        <JourneyDocuments />
        <JourneySettings />
      </div>
    </JourneyContext.Provider>
  );
}
