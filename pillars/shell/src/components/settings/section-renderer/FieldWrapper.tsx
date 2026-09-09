import { CheckCircle2, Loader2 } from 'lucide-react';

import { Badge, Label } from '@pops/ui';

import type { SettingsField } from '@pops/types';

import type { SaveState } from './types';

/**
 * The id stem a settings field's message paragraphs hang off.
 *
 * Every field kind sets `aria-invalid` on its control, which tells a screen
 * reader that something is wrong and nothing about what. The message lives in
 * this wrapper, so the id it is announced through has to be derivable from
 * both sides — the wrapper that renders the paragraph and the field that
 * renders the control. `field.key` is unique within a settings section, which
 * is the scope a page renders.
 *
 * The `-error` / `-description` suffixes are `@pops/ui`'s
 * `fieldLabelDescribedBy` convention, reused rather than reinvented so a field
 * points at the right paragraph without a second id scheme to keep in step.
 */
export function settingsFieldId(field: SettingsField): string {
  return `settings-field-${field.key}`;
}

interface FieldWrapperProps {
  field: SettingsField;
  children: React.ReactNode;
  saveState?: SaveState;
  /** Validation error for this field's control, shown the same way for every field kind. */
  error?: string;
}

export function FieldWrapper({ field, children, saveState, error }: FieldWrapperProps) {
  const required = !!field.validation?.required;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">
          {field.label}
          {required && (
            <span className="text-destructive" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </Label>
        {field.requiresRestart && (
          <Badge variant="outline" className="text-warning border-warning text-xs px-1.5 py-0">
            Requires restart
          </Badge>
        )}
        {saveState === 'saving' && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
        {saveState === 'saved' && <CheckCircle2 className="h-3 w-3 text-success" />}
      </div>
      {children}
      {error && (
        <p id={`${settingsFieldId(field)}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {field.description && (
        <p id={`${settingsFieldId(field)}-description`} className="text-xs text-muted-foreground">
          {field.description}
        </p>
      )}
    </div>
  );
}

export function EnvLabel({ envVar }: { envVar: string }) {
  return <p className="text-xs text-muted-foreground">Using environment variable {envVar}</p>;
}
