/**
 * A facsimile of the shell's settings `SectionRenderer`: one card per group,
 * the group's widget first, then its fields, each field labelled above its
 * control with its description under it. Each field saves on its own (the
 * shell debounces text by 500 ms), so there is no Save button: a spinner
 * beside the label while it saves, a tick once it has, and a validation
 * message instead of saving when the value breaks the field's rule.
 *
 * Drawn from the manifest itself, so a section designed here renders
 * exactly the fields its manifest declares and nothing the renderer cannot
 * express. Only the field kinds inventory uses are drawn.
 */
import { CheckCircle2, Loader2 } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Switch,
} from '@pops/ui';

import type { ReactNode } from 'react';

import type { SettingsManifestDescriptor } from '@pops/pillar-sdk/manifest-schema';

type SettingsGroup = SettingsManifestDescriptor['groups'][number];
type SettingsField = SettingsGroup['fields'][number];

/** Where one field's save is. */
export type FieldSaveState = 'idle' | 'saving' | 'saved';

/** Props for {@link SectionRenderer}. */
export interface SectionRendererProps {
  manifest: SettingsManifestDescriptor;
  /** Values by key, as the settings store holds them: strings, `'true'`/`'false'` for toggles. */
  values: Readonly<Record<string, string>>;
  saveStates?: Readonly<Record<string, FieldSaveState>>;
  /** A rejected value per key: shown in the field with the rule's message, not saved. */
  drafts?: Readonly<Record<string, string>>;
  /** The component each `widget.bundleSlot` resolves to. */
  widgets?: Readonly<Record<string, ReactNode>>;
  /** Every control is off while this is set. */
  locked?: boolean;
  onChange?: (key: string, value: string) => void;
}

/** The message a value earns under the field's rule, or null when it passes. */
export function fieldError(field: SettingsField, value: string): string | null {
  const rule = field.validation;
  if (rule === undefined) return null;
  if (rule.required && value.trim() === '') return rule.message ?? `${field.label} is required`;
  if (rule.pattern && value !== '' && !new RegExp(rule.pattern, 'u').test(value)) {
    return rule.message ?? 'Invalid format';
  }
  return null;
}

function fieldId(field: SettingsField): string {
  return `settings-field-${field.key}`;
}

function SaveMark({ state }: { state: FieldSaveState }) {
  if (state === 'saving') {
    return (
      <Loader2
        className="size-3 text-muted-foreground motion-safe:animate-spin"
        aria-label="Saving"
      />
    );
  }
  if (state === 'saved') return <CheckCircle2 className="size-3 text-success" aria-label="Saved" />;
  return null;
}

function Control({
  field,
  value,
  invalid,
  props,
}: {
  field: SettingsField;
  value: string;
  invalid: boolean;
  props: SectionRendererProps;
}) {
  const id = fieldId(field);
  const disabled = props.locked === true || props.saveStates?.[field.key] === 'saving';
  const change = (next: string) => props.onChange?.(field.key, next);
  if (field.type === 'toggle') {
    return (
      <Switch
        id={id}
        checked={value === 'true'}
        disabled={props.locked}
        onCheckedChange={(checked) => change(checked ? 'true' : 'false')}
      />
    );
  }
  if (field.type === 'select') {
    return (
      <Select
        id={id}
        value={value}
        options={field.options ?? []}
        disabled={disabled}
        onChange={(event) => change(event.target.value)}
      />
    );
  }
  return (
    <Input
      id={id}
      type={field.type === 'number' || field.type === 'url' ? field.type : 'text'}
      value={value}
      disabled={props.locked}
      aria-invalid={invalid || undefined}
      onChange={(event) => change(event.target.value)}
    />
  );
}

function Field({ field, props }: { field: SettingsField; props: SectionRendererProps }) {
  const draft = props.drafts?.[field.key];
  const value = draft ?? props.values[field.key] ?? field.default ?? '';
  const error = draft === undefined ? null : fieldError(field, draft);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={fieldId(field)} className="text-sm text-muted-foreground">
          {field.label}
        </Label>
        <SaveMark state={props.saveStates?.[field.key] ?? 'idle'} />
      </div>
      <Control field={field} value={value} invalid={error !== null} props={props} />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {field.description ? (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      ) : null}
    </div>
  );
}

function Group({ group, props }: { group: SettingsGroup; props: SectionRendererProps }) {
  const slot = group.widget?.bundleSlot;
  const widget = slot === undefined ? null : (props.widgets?.[slot] ?? null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{group.title}</CardTitle>
        {group.description ? <CardDescription>{group.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {widget}
        {group.fields.map((field) => (
          <Field key={field.key} field={field} props={props} />
        ))}
      </CardContent>
    </Card>
  );
}

/** Every group of one settings section, in manifest order. */
export function SectionRenderer(props: SectionRendererProps) {
  return (
    <div className="space-y-4">
      {props.manifest.groups.map((group) => (
        <Group key={group.id} group={group} props={props} />
      ))}
    </div>
  );
}
