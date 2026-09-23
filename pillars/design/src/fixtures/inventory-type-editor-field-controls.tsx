import { cataloguePrimitiveDefinitions } from '@/fixtures/inventory-type-primitives';
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
  Textarea,
} from '@pops/ui';

import type { CatalogueFieldKind, CatalogueFieldSummary } from '@/fixtures/inventory-type-fields';
import type { CataloguePrimitiveDefinition } from '@/fixtures/inventory-type-primitives';

/** Renders editable field naming and immutable-key context for a primitive state. */
export function FieldIdentity({ field }: { field: CatalogueFieldSummary }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="primitive-field-label">Field label</Label>
          <Input id="primitive-field-label" defaultValue={field.label} className="min-h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="primitive-field-key">Key</Label>
          <Input
            id="primitive-field-key"
            defaultValue={field.key}
            className="min-h-11 font-mono"
            disabled
          />
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <LockKeyhole className="h-3.5 w-3.5" /> Locked after publication
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="primitive-field-help">Help text</Label>
        <Textarea id="primitive-field-help" defaultValue={field.helpText} />
      </div>
    </div>
  );
}

/** Renders the complete primitive vocabulary and the kind's cardinality rule. */
export function KindAndCardinality({
  kind,
  definition,
}: {
  kind: CatalogueFieldKind;
  definition: CataloguePrimitiveDefinition;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
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
        <p className="text-xs text-muted-foreground">{definition.contract}</p>
      </div>
      <div className="space-y-2">
        <Label>Cardinality</Label>
        <RadioGroup
          defaultValue="one"
          className="grid grid-cols-2 gap-2"
          disabled={kind === 'boolean'}
        >
          <Label
            htmlFor={`cardinality-one-${kind}`}
            className="flex min-h-11 items-center gap-2 rounded-lg border px-3 font-normal"
          >
            <RadioGroupItem id={`cardinality-one-${kind}`} value="one" /> One
          </Label>
          <Label
            htmlFor={`cardinality-many-${kind}`}
            className="flex min-h-11 items-center gap-2 rounded-lg border px-3 font-normal"
          >
            <RadioGroupItem id={`cardinality-many-${kind}`} value="many" /> Many
          </Label>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          {kind === 'boolean'
            ? 'Yes / no fields always store one value.'
            : 'Many keeps entry order.'}
        </p>
      </div>
    </div>
  );
}
