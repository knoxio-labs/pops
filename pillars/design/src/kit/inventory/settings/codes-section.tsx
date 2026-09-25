/**
 * Settings, Codes: whether the server suggests a code for new items, and
 * the pattern it follows, previewed on three real types as you type. An
 * invalid pattern says what is wrong in one line and blocks Save.
 */
import { Switch, TextInput } from '@pops/ui';

import { previewCodes } from './code-pattern';
import { SettingRow, SettingsCard } from './settings-parts';

import type { CodeSample } from './code-pattern';
import type { SettingsState } from './settings-model';

const SAMPLES: readonly (CodeSample & { label: string })[] = [
  { label: 'Next moving box', typeName: 'Moving box', next: 13 },
  { label: 'Next tool', typeName: 'Tools', next: 2 },
  { label: 'Next untyped item', typeName: null, next: 5 },
];

/** The codes card. */
export function CodesSection({
  state,
  onToggle,
  onPattern,
}: {
  state: SettingsState;
  onToggle: (on: boolean) => void;
  onPattern: (pattern: string) => void;
}) {
  const on = state.draft.suggestCodes;
  const preview = previewCodes(state.draft.codePattern, SAMPLES);
  return (
    <SettingsCard
      title="Codes"
      description="The short code printed on a label. You can always type your own."
    >
      <SettingRow
        label="Suggest a code for new items"
        hint="Taken codes are skipped; a collision still blocks saving."
      >
        <Switch checked={on} onCheckedChange={onToggle} aria-label="Suggest a code for new items" />
      </SettingRow>
      {on ? (
        <>
          <TextInput
            label="Pattern"
            value={state.draft.codePattern}
            onChange={(event) => onPattern(event.target.value)}
            error={preview.ok ? undefined : preview.error}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            <code className="font-mono">{'{type}'}</code> is the type&apos;s first letter, X when
            untyped. <code className="font-mono">{'{##}'}</code> is the number, at least as many
            digits as #.
          </p>
          {preview.ok ? (
            <dl className="grid grid-cols-3 gap-2">
              {SAMPLES.map((sample, index) => (
                <div key={sample.label} className="rounded-md bg-muted/50 px-3 py-2">
                  <dt className="text-2xs text-muted-foreground">{sample.label}</dt>
                  <dd className="font-mono text-sm font-medium">{preview.codes[index]}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          New items start without a code; add one when you print a label.
        </p>
      )}
    </SettingsCard>
  );
}
