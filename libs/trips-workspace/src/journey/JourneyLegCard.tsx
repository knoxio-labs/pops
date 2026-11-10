import { GripVertical, Trash2 } from 'lucide-react';

import { Button, TextInput, cn } from '@pops/ui';

import { JourneyEndpointFields } from './JourneyEndpointFields';
import { JourneyLegMetadata, JourneyLegStatus } from './JourneyLegFields';

import type { JSX } from 'react';

import type { Place } from '../stay/types';
import type { JourneyLeg, LegPatch } from './types';
import type { JourneyEditor } from './use-journey-editor';

/** Source leg controls retain independent purchase, intention and arrangement axes. */
export function JourneyLegCard({
  leg,
  editor,
  places,
  index,
}: {
  leg: JourneyLeg;
  editor: JourneyEditor;
  places: Place[];
  index: number;
}): JSX.Element {
  const edit = (patch: LegPatch): void => editor.edit({ kind: 'leg', id: leg.id, patch });
  const save = (patch: LegPatch): void => void editor.run({ kind: 'leg', id: leg.id, patch });
  return (
    <article
      aria-label={`Transport leg ${index + 1}`}
      className={cn(
        'space-y-3 rounded-xl border border-dashed bg-muted/40 p-3',
        leg.purchase === 'Purchased' && 'border-solid border-l-4 border-l-app-accent'
      )}
    >
      <header className="flex items-center gap-2">
        <GripVertical className="size-4" aria-hidden />
        <h2 className="flex-1 text-sm font-semibold">
          {leg.mode ?? 'Transport'} · {index + 1}
        </h2>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Remove transport leg ${index + 1}`}
          onClick={() => void editor.run({ kind: 'remove', id: leg.id })}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </header>
      <TextInput
        label="Transport mode"
        value={leg.mode ?? ''}
        onChange={(event) => edit({ mode: event.target.value || null })}
        onBlur={() => save({ mode: leg.mode })}
      />
      <JourneyLegStatus leg={leg} edit={edit} save={save} />
      <JourneyEndpointFields leg={leg} side="from" places={places} edit={edit} save={save} />
      <JourneyEndpointFields leg={leg} side="to" places={places} edit={edit} save={save} />
      <JourneyLegMetadata leg={leg} edit={edit} save={save} />
    </article>
  );
}
