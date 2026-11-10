import { Textarea, TextInput } from '@pops/ui';

import { SourceReferences } from './SourceReferences';

import type { JSX } from 'react';

import type { JourneyEditor } from './use-journey-editor';

/** Editable source metadata and optional thresholds; absent buffers have no implicit defaults. */
export function JourneyMetadata({ editor }: { editor: JourneyEditor }): JSX.Element {
  const journey = editor.draft.journey;
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
        References and timing
      </summary>
      <div className="space-y-3 rounded-xl border bg-muted/40 p-3">
        {(['name', 'reference'] as const).map((field) => (
          <TextInput
            key={field}
            label={metadataLabels[field]}
            value={journey[field] ?? ''}
            onChange={(event) =>
              editor.edit({
                kind: 'journey',
                patch: {
                  [field]: event.target.value || null,
                },
              })
            }
            onBlur={() =>
              void editor.run({
                kind: 'journey',
                patch: {
                  [field]: journey[field],
                },
              })
            }
          />
        ))}
        <label className="block space-y-2 text-sm">
          Journey notes
          <Textarea
            value={journey.notes}
            onChange={(event) =>
              editor.edit({ kind: 'journey', patch: { notes: event.target.value } })
            }
            onBlur={() => void editor.run({ kind: 'journey', patch: { notes: journey.notes } })}
          />
        </label>
        <JourneyBuffers editor={editor} />
        <SourceReferences
          links={journey.sourceLinks}
          save={(sourceLinks) => void editor.run({ kind: 'journey', patch: { sourceLinks } })}
        />
      </div>
    </details>
  );
}

const metadataLabels = {
  name: 'Journey name',
  reference: 'Journey reference',
};

function JourneyBuffers({ editor }: { editor: JourneyEditor }): JSX.Element {
  const journey = editor.draft.journey;
  return (
    <>
      {(
        [
          ['minimumConnectionMinutes', 'Connection minimum · min'],
          ['airportBufferMinutes', 'Before airport departure · min'],
        ] as const
      ).map(([field, label]) => (
        <TextInput
          key={field}
          label={label}
          type="number"
          min={0}
          step="any"
          value={journey.buffers[field] ?? ''}
          onChange={(event) => {
            const buffers = { ...journey.buffers };
            if (event.target.value === '') delete buffers[field];
            else buffers[field] = event.target.valueAsNumber;
            editor.edit({ kind: 'journey', patch: { buffers } });
          }}
          onBlur={() => void editor.run({ kind: 'journey', patch: { buffers: journey.buffers } })}
        />
      ))}
    </>
  );
}
