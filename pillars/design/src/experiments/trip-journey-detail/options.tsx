import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button } from '@pops/ui';

import { endpointDay, journeyTitle } from './display';
import { JourneyOptionEditor } from './option-editor';
import { addJourneyOption, selectJourneyOption } from './option-model';
import { useJourneyOptions } from './options-context';

import type { JourneyOption } from './option-model';

/** Stacked source alternatives remain editable without replacing the working journey. */
export function JourneyOptions() {
  const { state, change } = useJourneyOptions();
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <section aria-label="Journey alternatives" className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Alternatives</h2>
        <Button
          variant="ghost"
          onClick={() => {
            const next = addJourneyOption(state);
            change(next);
            setExpanded(next.options.at(-1)?.id ?? null);
          }}
        >
          <Plus className="size-4" aria-hidden />
          Add option
        </Button>
      </div>
      {state.options.map((option, index) => (
        <article
          key={option.id}
          aria-label={`Alternative ${index + 1}`}
          className="space-y-2 rounded-lg border border-dashed border-foreground/30 bg-card p-3"
        >
          <OptionSummary option={option} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              aria-expanded={expanded === option.id}
              onClick={() => setExpanded(expanded === option.id ? null : option.id)}
            >
              Edit option
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                change(selectJourneyOption(state, option.id));
                setExpanded(null);
              }}
            >
              Use journey
            </Button>
          </div>
          {expanded === option.id && <JourneyOptionEditor option={option} />}
        </article>
      ))}
    </section>
  );
}

function OptionSummary({ option }: { option: JourneyOption }) {
  const { journey } = option;
  const first = journey.legs.at(0);
  const last = journey.legs.at(-1);
  const purchased = journey.legs.filter((leg) => leg.status === 'Purchased').length;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <h3 className="font-semibold">{journeyTitle(journey)}</h3>
      {first && last && (
        <span className="text-sm text-muted-foreground">
          {[endpointDay(first.from), endpointDay(last.to)].filter(Boolean).join(' → ')}
        </span>
      )}
      {purchased > 0 && (
        <Badge>
          {purchased} purchased {purchased === 1 ? 'leg' : 'legs'}
        </Badge>
      )}
    </div>
  );
}
