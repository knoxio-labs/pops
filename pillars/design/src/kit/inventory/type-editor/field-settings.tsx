import {
  cataloguePrimitiveDefinitions,
  primitiveDefinition,
} from '@/fixtures/inventory-type-primitives';
import { LockKeyhole } from 'lucide-react';

import {
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  SelectContent,
  SelectItem,
  SelectPrimitive,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@pops/ui';

import { EnumOptions } from './enum-options';
import { MeasurementUnit, ReferenceTargets } from './field-constraints';

import type { CatalogueFieldKind, CatalogueFieldSummary } from '@/fixtures/inventory-type-fields';

/** Yes / no fields always store exactly one value, so their cardinality is fixed. */
export function cardinalityLocked(kind: CatalogueFieldKind): boolean {
  return kind === 'boolean';
}

function FieldIdentity({ field }: { field: CatalogueFieldSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="field-label">Field label</Label>
        <Input id="field-label" defaultValue={field.label} className="min-h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="field-key">Key</Label>
        <Input id="field-key" defaultValue={field.key} className="min-h-11 font-mono" disabled />
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" /> Locked after publication
        </p>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="field-help">Help text</Label>
        <Textarea id="field-help" defaultValue={field.helpText} className="min-h-16" />
      </div>
    </div>
  );
}

function KindPicker({ kind }: { kind: CatalogueFieldKind }) {
  const definition = primitiveDefinition(kind);
  return (
    <div className="space-y-2">
      <Label>Primitive kind</Label>
      <SelectPrimitive value={kind}>
        <SelectTrigger className="min-h-11">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {cataloguePrimitiveDefinitions.map((option) => (
            <SelectItem key={option.kind} value={option.kind}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectPrimitive>
      <p className="text-xs text-muted-foreground">
        {definition.contract}. Example:{' '}
        <span className="whitespace-nowrap font-mono">{definition.example}</span>
      </p>
    </div>
  );
}

function CardinalityChoice({ field }: { field: CatalogueFieldSummary }) {
  const locked = cardinalityLocked(field.kind);
  return (
    <div className="space-y-2">
      <Label>Cardinality</Label>
      <RadioGroup
        defaultValue={locked ? 'one' : field.cardinality}
        className="grid grid-cols-2 gap-2"
        disabled={locked}
      >
        {(['one', 'many'] as const).map((value) => (
          <Label
            key={value}
            htmlFor={`cardinality-${value}`}
            className="flex min-h-11 items-center gap-2 rounded-lg border px-3 font-normal"
          >
            <RadioGroupItem id={`cardinality-${value}`} value={value} />
            {value === 'one' ? 'One' : 'Many'}
          </Label>
        ))}
      </RadioGroup>
      <p className="text-xs text-muted-foreground">
        {locked ? 'Yes / no fields always store one value.' : 'Many keeps entry order.'}
      </p>
    </div>
  );
}

function KindConstraints({ field }: { field: CatalogueFieldSummary }) {
  if (field.unit !== undefined) return <MeasurementUnit unit={field.unit} />;
  if (field.reference !== undefined) return <ReferenceTargets targets={field.reference} />;
  if (field.kind === 'enum') return <EnumOptions />;
  return null;
}

function FieldToggle({
  id,
  label,
  detail,
  checked,
}: Record<'id' | 'label' | 'detail', string> & {
  checked: boolean;
}) {
  return (
    <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <Switch id={id} defaultChecked={checked} />
    </div>
  );
}

/**
 * One stored field's settings for any primitive kind: identity, kind and
 * cardinality, the kind's own constraints (unit, reference targets or
 * options), and the required and highlighted switches.
 */
export function FieldSettings({ field }: { field: CatalogueFieldSummary }) {
  return (
    <div className="space-y-5">
      <FieldIdentity field={field} />
      <div className="grid gap-4 sm:grid-cols-2">
        <KindPicker kind={field.kind} />
        <CardinalityChoice field={field} />
      </div>
      <KindConstraints field={field} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldToggle
          id="field-required"
          label="Required"
          detail="Items must have at least one value."
          checked={field.required}
        />
        <FieldToggle
          id="field-highlighted"
          label="Highlighted"
          detail="Show this value in item summaries."
          checked={field.highlighted}
        />
      </div>
    </div>
  );
}
