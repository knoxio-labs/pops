import { useCallback, useState } from 'react';

import { DurationField } from './fields/DurationField';
import { JsonField } from './fields/JsonField';
import { PasswordField } from './fields/PasswordField';
import { SelectField } from './fields/SelectField';
import { TextLikeField } from './fields/TextLikeField';
import { ToggleField } from './fields/ToggleField';
import { validateField } from './utils';

import type { FieldProps } from './types';

export function FieldInput(props: FieldProps) {
  const { field, value, onChange, saveState } = props;
  const [validationError, setValidationError] = useState<string>('');
  // A rejected value is still what the user typed, so it has to stay on screen:
  // without a draft the input snaps back to the last valid value on every
  // keystroke, and a bounded number can never be edited across its own bounds
  // (typing `2` towards `200` under `min: 50` is rejected mid-word).
  const [draft, setDraft] = useState<string | null>(null);

  const handleChange = useCallback(
    (newVal: string) => {
      const err = validateField(field, newVal);
      setValidationError(err);
      if (err) {
        setDraft(newVal);
        return;
      }
      setDraft(null);
      onChange(field.key, newVal);
    },
    [field, onChange]
  );

  if (field.type === 'duration') {
    return <DurationField field={field} value={value} onChange={onChange} saveState={saveState} />;
  }

  return (
    <NonDurationField
      props={draft === null ? props : { ...props, value: draft }}
      handleChange={handleChange}
      validationError={validationError}
    />
  );
}

interface NonDurationFieldProps {
  props: FieldProps;
  handleChange: (val: string) => void;
  validationError: string;
}

function NonDurationField({ props, handleChange, validationError }: NonDurationFieldProps) {
  const { field, value, onTestAction, envFallbackActive, saveState, isOptionsLoading } = props;
  const common = { field, value, envFallbackActive, saveState };

  switch (field.type) {
    case 'toggle':
      return <ToggleField {...common} onChange={handleChange} />;
    case 'select':
      return (
        <SelectField {...common} onChange={handleChange} isOptionsLoading={isOptionsLoading} />
      );
    case 'json':
      return <JsonField {...common} onChange={handleChange} />;
    case 'password':
      return (
        <PasswordField
          {...common}
          onChange={handleChange}
          onTestAction={onTestAction}
          validationError={validationError}
        />
      );
    default:
      return (
        <TextLikeField
          {...common}
          onChange={handleChange}
          onTestAction={onTestAction}
          validationError={validationError}
        />
      );
  }
}
