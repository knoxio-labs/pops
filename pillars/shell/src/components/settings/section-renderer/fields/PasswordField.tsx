import { RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { Button, Input, fieldLabelDescribedBy } from '@pops/ui';

import { EnvLabel, FieldWrapper, settingsFieldId } from '../FieldWrapper';
import { TestActionIcon } from '../TestActionIcon';
import { useTestAction } from '../useTestAction';

import type { SettingsField } from '@pops/types';

import type { SaveState, TestState } from '../types';

interface PasswordFieldProps {
  field: SettingsField;
  value: string;
  onChange: (val: string) => void;
  onTestAction: (procedure: string) => Promise<void>;
  envFallbackActive: boolean;
  saveState: SaveState;
  validationError: string;
}

interface PasswordTestButtonProps {
  field: SettingsField;
  testState: TestState;
  disabled: boolean;
  onRun: () => void;
}

function PasswordTestButton({ field, testState, disabled, onRun }: PasswordTestButtonProps) {
  if (!field.testAction) return null;
  return (
    <Button variant="outline" size="sm" onClick={onRun} disabled={disabled} type="button">
      <TestActionIcon state={testState} fallback={<RefreshCw className="h-3.5 w-3.5" />} />
      <span className="ml-1">{field.testAction.label}</span>
    </Button>
  );
}

export function PasswordField({
  field,
  value,
  onChange,
  onTestAction,
  envFallbackActive,
  saveState,
  validationError,
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const { testState, testError, runTest } = useTestAction(onTestAction);
  const saving = saveState === 'saving';

  const handleTest = () => {
    if (field.testAction) void runTest(field.testAction.procedure);
  };

  return (
    <FieldWrapper field={field} saveState={saveState} error={validationError}>
      <div className="flex gap-2">
        <Input
          type={revealed ? 'text' : 'password'}
          value={value}
          placeholder={envFallbackActive ? '(from environment)' : '••••••••'}
          onChange={(e) => onChange(e.target.value)}
          disabled={saving}
          aria-invalid={!!validationError || undefined}
          aria-required={field.validation?.required || undefined}
          aria-describedby={fieldLabelDescribedBy(settingsFieldId(field), {
            error: validationError,
            description: field.description,
          })}
          className="flex-1"
        />
        <Button variant="outline" size="sm" onClick={() => setRevealed((r) => !r)} type="button">
          {revealed ? 'Hide' : 'Reveal'}
        </Button>
        <PasswordTestButton
          field={field}
          testState={testState}
          disabled={testState === 'loading' || saving}
          onRun={handleTest}
        />
      </div>
      {testState === 'error' && testError && (
        <p className="text-xs text-destructive">{testError}</p>
      )}
      {envFallbackActive && field.envFallback && <EnvLabel envVar={field.envFallback} />}
    </FieldWrapper>
  );
}
