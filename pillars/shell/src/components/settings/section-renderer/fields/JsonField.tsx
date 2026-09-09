import { Textarea, fieldLabelDescribedBy } from '@pops/ui';

import { EnvLabel, FieldWrapper, settingsFieldId } from '../FieldWrapper';

import type { SettingsField } from '@pops/types';

import type { SaveState } from '../types';

interface JsonFieldProps {
  field: SettingsField;
  value: string;
  onChange: (val: string) => void;
  envFallbackActive: boolean;
  saveState: SaveState;
  validationError?: string;
}

export function JsonField({
  field,
  value,
  onChange,
  envFallbackActive,
  saveState,
  validationError,
}: JsonFieldProps) {
  return (
    <FieldWrapper field={field} saveState={saveState} error={validationError}>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="font-mono text-sm"
        disabled={saveState === 'saving'}
        aria-invalid={!!validationError || undefined}
        aria-required={field.validation?.required || undefined}
        aria-describedby={fieldLabelDescribedBy(settingsFieldId(field), {
          error: validationError,
          description: field.description,
        })}
      />
      {envFallbackActive && field.envFallback && <EnvLabel envVar={field.envFallback} />}
    </FieldWrapper>
  );
}
