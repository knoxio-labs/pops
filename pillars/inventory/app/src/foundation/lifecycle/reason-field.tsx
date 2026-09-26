/**
 * The reason a lifecycle act records on its event: a row of presets, one
 * tap each, and a note that becomes required only when the preset is
 * Other. The same reason lands on every item of a bulk act.
 */
import { Button, Label, Textarea } from '@pops/ui';

import { actCopy } from './lifecycle-model';

import type { LifecycleAct } from './lifecycle-model';

/** Props for {@link ReasonField}. */
export interface ReasonFieldProps {
  act: LifecycleAct;
  preset: string | null;
  text: string;
  onPreset: (preset: string | null) => void;
  onText: (text: string) => void;
}

/** Presets plus an optional note. */
export function ReasonField({ act, preset, text, onPreset, onText }: ReasonFieldProps) {
  const copy = actCopy(act);
  const other = preset === 'Other';
  return (
    <div className="flex flex-col gap-2">
      <p id={`reason-${act}`} className="text-sm font-medium">
        Reason{' '}
        {copy.reasonRequired ? null : (
          <span className="font-normal text-muted-foreground">(optional)</span>
        )}
      </p>
      <div role="group" aria-labelledby={`reason-${act}`} className="flex flex-wrap gap-2">
        {copy.reasons.map((reason) => (
          <Button
            key={reason}
            size="sm"
            variant={preset === reason ? 'secondary' : 'outline'}
            aria-pressed={preset === reason}
            onClick={() => onPreset(preset === reason ? null : reason)}
            className={
              preset === reason ? 'border border-app-accent/60 bg-app-accent/15' : undefined
            }
          >
            {reason}
          </Button>
        ))}
      </div>
      <Label htmlFor={`note-${act}`} className="sr-only">
        Note
      </Label>
      <Textarea
        id={`note-${act}`}
        value={text}
        onChange={(event) => onText(event.target.value)}
        placeholder={
          other ? 'Say what happened. Required for Other.' : 'Add a note for the history (optional)'
        }
        className="min-h-16 text-sm"
      />
    </div>
  );
}
