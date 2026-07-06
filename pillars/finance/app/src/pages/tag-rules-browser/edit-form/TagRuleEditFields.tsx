/**
 * Field components for `TagRuleEditDialog` — split out so the dialog file
 * stays under the line cap. `descriptionPattern` / `matchType` are read-only
 * context (see the dialog's doc comment); everything else here is editable.
 */
import { Controller, type UseFormReturn } from 'react-hook-form';

import {
  Badge,
  CheckboxInput,
  ChipInput,
  EntitySelect,
  type EntityOption,
  Label,
  NumberInput,
  Slider,
} from '@pops/ui';

import { type TagRuleEditFormValues } from './types';

import type { TagRule } from '../types';

export function PatternContext({ rule }: { rule: TagRule }) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <Label>Pattern</Label>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{rule.descriptionPattern}</span>
        <Badge variant="outline">{rule.matchType}</Badge>
      </div>
    </div>
  );
}

export function EntityField({
  form,
  entities,
}: {
  form: UseFormReturn<TagRuleEditFormValues>;
  entities: EntityOption[];
}) {
  return (
    <Controller
      control={form.control}
      name="entityId"
      render={({ field }) => (
        <div className="flex flex-col gap-1.5 w-full">
          <Label>Entity</Label>
          <EntitySelect
            entities={entities}
            value={field.value ?? undefined}
            onChange={(id) => field.onChange(id)}
            placeholder="Global (any entity)..."
          />
        </div>
      )}
    />
  );
}

export function TagsField({ form }: { form: UseFormReturn<TagRuleEditFormValues> }) {
  return (
    <div className="space-y-2">
      <Label>Tags</Label>
      <Controller
        control={form.control}
        name="tags"
        render={({ field }) => (
          <ChipInput
            placeholder="Type and press Enter..."
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      {form.formState.errors.tags && (
        <p className="text-sm text-destructive">{form.formState.errors.tags.message}</p>
      )}
    </div>
  );
}

export function ConfidenceField({ form }: { form: UseFormReturn<TagRuleEditFormValues> }) {
  return (
    <Controller
      control={form.control}
      name="confidence"
      render={({ field }) => (
        <div className="flex flex-col gap-1.5 w-full">
          <Label>Confidence</Label>
          <div className="flex items-center gap-2">
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[field.value]}
              onValueChange={(values) => field.onChange(values[0] ?? field.value)}
              className="w-full"
              aria-label="Confidence"
            />
            <span className="text-xs tabular-nums w-10 text-right">
              {(field.value * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
    />
  );
}

export function PriorityField({ form }: { form: UseFormReturn<TagRuleEditFormValues> }) {
  return (
    <Controller
      control={form.control}
      name="priority"
      render={({ field }) => (
        <div className="flex flex-col gap-1.5 w-full">
          <Label>Priority</Label>
          <NumberInput
            min={0}
            value={field.value}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              field.onChange(Number.isFinite(next) ? next : 0);
            }}
            aria-label="Priority"
          />
        </div>
      )}
    />
  );
}

export function ActiveField({ form }: { form: UseFormReturn<TagRuleEditFormValues> }) {
  return (
    <Controller
      control={form.control}
      name="isActive"
      render={({ field }) => (
        <CheckboxInput
          label="Active"
          description="Inactive rules are skipped by the tag suggester."
          checked={field.value}
          onCheckedChange={(checked) => field.onChange(Boolean(checked))}
        />
      )}
    />
  );
}
