import { Switch, fieldLabelDescribedBy } from '@pops/ui';

import { EnvLabel, FieldWrapper, settingsFieldId } from '../FieldWrapper';

import type { SettingsField } from '@pops/types';

import type { SaveState } from '../types';

interface ToggleFieldProps {
  field: SettingsField;
  value: string;
  onChange: (val: string) => void;
  envFallbackActive: boolean;
  saveState: SaveState;
  validationError?: string;
}

export function ToggleField({
  field,
  value,
  onChange,
  envFallbackActive,
  saveState,
  validationError,
}: ToggleFieldProps) {
  return (
    <FieldWrapper field={field} saveState={saveState} error={validationError}>
      <Switch
        checked={value === 'true'}
        onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
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
