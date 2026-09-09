import { Select, fieldLabelDescribedBy } from '@pops/ui';

import { EnvLabel, FieldWrapper, settingsFieldId } from '../FieldWrapper';

import type { SettingsField } from '@pops/types';

import type { SaveState } from '../types';

interface SelectFieldProps {
  field: SettingsField;
  value: string;
  onChange: (val: string) => void;
  envFallbackActive: boolean;
  saveState: SaveState;
  isOptionsLoading?: boolean;
  validationError?: string;
}

export function SelectField({
  field,
  value,
  onChange,
  envFallbackActive,
  saveState,
  isOptionsLoading,
  validationError,
}: SelectFieldProps) {
  const disabled = isOptionsLoading || saveState === 'saving';

  return (
    <FieldWrapper field={field} saveState={saveState} error={validationError}>
      {isOptionsLoading ? (
        <Select disabled options={[]} placeholder="Loading options…" value="" />
      ) : (
        <Select
          options={field.options ?? []}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!validationError || undefined}
          aria-required={field.validation?.required || undefined}
          aria-describedby={fieldLabelDescribedBy(settingsFieldId(field), {
            error: validationError,
            description: field.description,
          })}
        />
      )}
      {envFallbackActive && field.envFallback && <EnvLabel envVar={field.envFallback} />}
    </FieldWrapper>
  );
}
