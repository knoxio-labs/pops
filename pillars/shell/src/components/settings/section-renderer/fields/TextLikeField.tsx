import { Button, Input, cn } from '@pops/ui';

import { EnvLabel, FieldWrapper } from '../FieldWrapper';
import { TestActionIcon } from '../TestActionIcon';
import { useTestAction } from '../useTestAction';
import { getInputType } from '../utils';

import type { SettingsField } from '@pops/types';

import type { SaveState, TestState } from '../types';

interface TextLikeFieldProps {
  field: SettingsField;
  value: string;
  onChange: (val: string) => void;
  onTestAction: (procedure: string) => Promise<void>;
  envFallbackActive: boolean;
  saveState: SaveState;
  validationError: string;
}

interface TestActionButtonProps {
  field: SettingsField;
  testState: TestState;
  disabled: boolean;
  onRun: () => void;
}

function TestActionButton({ field, testState, disabled, onRun }: TestActionButtonProps) {
  if (!field.testAction) return null;
  return (
    <Button variant="outline" size="sm" onClick={onRun} disabled={disabled} type="button">
      <TestActionIcon state={testState} fallback={null} />
      <span className={cn(testState !== 'idle' && 'ml-1')}>{field.testAction.label}</span>
    </Button>
  );
}

interface NumberBounds {
  min: number | undefined;
  max: number | undefined;
}

function getNumberBounds(field: SettingsField): NumberBounds {
  if (field.type !== 'number') return { min: undefined, max: undefined };
  return { min: field.validation?.min, max: field.validation?.max };
}

export function TextLikeField({
  field,
  value,
  onChange,
  onTestAction,
  envFallbackActive,
  saveState,
  validationError,
}: TextLikeFieldProps) {
  const inputType = getInputType(field.type);
  const { testState, testError, runTest } = useTestAction(onTestAction);
  const saving = saveState === 'saving';
  const { min, max } = getNumberBounds(field);

  const handleTest = () => {
    if (field.testAction) void runTest(field.testAction.procedure);
  };

  return (
    <FieldWrapper field={field} saveState={saveState} error={validationError}>
      <div className="flex gap-2">
        <Input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          disabled={saving}
          aria-invalid={!!validationError || undefined}
          aria-required={field.validation?.required || undefined}
          className="flex-1"
        />
        <TestActionButton
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
