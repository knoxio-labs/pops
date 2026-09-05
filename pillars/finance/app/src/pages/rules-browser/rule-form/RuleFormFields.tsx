/**
 * The individual form fields `RuleFormDialog` composes. Split out of that file
 * so it stays under the 200-line cap once the account-scope field landed
 * (POPS-2593); the dialog keeps the layout, these keep the controls.
 */
import { Controller, type UseFormReturn } from 'react-hook-form';

import {
  AccountSelect,
  type AccountOption,
  CheckboxInput,
  ChipInput,
  EntitySelect,
  type EntityOption,
  Label,
  NumberInput,
  Select,
  TextInput,
} from '@pops/ui';

import { MATCH_TYPE_OPTIONS, type RuleFormValues } from './types';

function PriorityField({ form }: { form: UseFormReturn<RuleFormValues> }) {
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

function EntityField({
  form,
  entities,
}: {
  form: UseFormReturn<RuleFormValues>;
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
            aria-label="Entity"
            entities={entities}
            value={field.value ?? undefined}
            onChange={(id) => field.onChange(id)}
            onClear={() => field.onChange(null)}
            placeholder="Choose entity..."
          />
        </div>
      )}
    />
  );
}

/**
 * Optional account scope (POPS-2593). Defaults to "any account", which is what
 * every rule was before this field existed — narrowing is a deliberate opt-in
 * for a merchant that genuinely differs per account, such as two banks both
 * posting `LATE FEE`.
 */
function AccountField({
  form,
  accounts,
}: {
  form: UseFormReturn<RuleFormValues>;
  accounts: AccountOption[];
}) {
  return (
    <Controller
      control={form.control}
      name="accountId"
      render={({ field }) => (
        <div className="flex flex-col gap-1.5 w-full">
          <Label>Account</Label>
          <AccountSelect
            aria-label="Account"
            accounts={accounts}
            value={field.value ?? undefined}
            onChange={(id) => field.onChange(id)}
            onClear={() => field.onChange(null)}
            clearLabel="Any account"
            placeholder="Any account"
          />
          <p className="text-xs text-muted-foreground">
            Leave as “Any account” unless this merchant means something different on one account — a
            scoped rule wins over an unscoped one, and never fires anywhere else.
          </p>
        </div>
      )}
    />
  );
}

export function PatternAndType({
  form,
  entities,
  accounts,
}: {
  form: UseFormReturn<RuleFormValues>;
  entities: EntityOption[];
  accounts: AccountOption[];
}) {
  return (
    <>
      <TextInput
        label="Pattern"
        placeholder="e.g. WOOLWORTHS"
        {...form.register('descriptionPattern')}
        error={form.formState.errors.descriptionPattern?.message}
      />
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Match Type"
          options={MATCH_TYPE_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          {...form.register('matchType')}
        />
        <PriorityField form={form} />
      </div>
      <EntityField form={form} entities={entities} />
      <AccountField form={form} accounts={accounts} />
    </>
  );
}

export function TagsAndActive({ form }: { form: UseFormReturn<RuleFormValues> }) {
  return (
    <>
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
      </div>
      <Controller
        control={form.control}
        name="isActive"
        render={({ field }) => (
          <CheckboxInput
            label="Active"
            description="Inactive rules are skipped by the matcher."
            checked={field.value}
            onCheckedChange={(checked) => field.onChange(Boolean(checked))}
          />
        )}
      />
    </>
  );
}
