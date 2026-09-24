import { catalogueTypes } from '@/fixtures/inventory-type-catalogue';

import { Checkbox, Input, Label } from '@pops/ui';

import { referenceScope, referenceTargetSummary, showsItemTypes } from './reference-targets';

import type {
  CatalogueMeasurementUnit,
  CatalogueReferenceTargets,
} from '@/fixtures/inventory-type-fields';

function typeLabel(typeId: string): string {
  return catalogueTypes.find((type) => type.id === typeId)?.label ?? typeId;
}

/** Fixed unit of a measurement field and the dimension computed fields convert within. */
export function MeasurementUnit({ unit }: { unit: CatalogueMeasurementUnit }) {
  return (
    <section className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 sm:items-start">
      <div className="space-y-2">
        <Label htmlFor="field-fixed-unit">Fixed unit</Label>
        <Input id="field-fixed-unit" defaultValue={unit.symbol} className="min-h-11 font-mono" />
      </div>
      <div className="space-y-1 text-sm sm:pt-7">
        <p>
          Dimension: <span className="font-medium">{unit.dimension}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Every value uses {unit.symbol}. Computed fields convert between units of the same
          dimension. Locks after publication.
        </p>
      </div>
    </section>
  );
}

function TargetKind({
  kind,
  checked,
}: {
  kind: CatalogueReferenceTargets['kinds'][number];
  checked: boolean;
}) {
  return (
    <Label
      htmlFor={`reference-kind-${kind}`}
      className="flex min-h-11 items-center gap-3 rounded-lg border px-3 font-normal"
    >
      <Checkbox id={`reference-kind-${kind}`} defaultChecked={checked} />
      {kind === 'item' ? 'Inventory item' : 'Location'}
    </Label>
  );
}

function ItemTypes({ targets }: { targets: CatalogueReferenceTargets }) {
  const mixed = referenceScope(targets) === 'items-and-locations';
  return (
    <div className="space-y-2">
      <Label>Allowed item types</Label>
      <div className="grid gap-2 sm:grid-cols-3">
        {catalogueTypes
          .filter((type) => type.status !== 'archived')
          .map((type) => (
            <Label
              key={type.id}
              htmlFor={`reference-type-${type.id}`}
              className="flex min-h-11 items-center gap-3 rounded-lg border px-3 font-normal"
            >
              <Checkbox
                id={`reference-type-${type.id}`}
                defaultChecked={targets.typeIds.includes(type.id)}
              />
              {type.label}
            </Label>
          ))}
      </div>
      <p className="text-xs text-muted-foreground">
        None checked allows every item type.
        {mixed ? ' Types never limit locations.' : ''}
      </p>
    </div>
  );
}

/** Target kinds and item-type constraint of a reference field, for any mix of kinds. */
export function ReferenceTargets({ targets }: { targets: CatalogueReferenceTargets }) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-medium">Reference targets</h3>
        <p className="text-sm text-muted-foreground">
          {referenceTargetSummary(targets, typeLabel)}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <TargetKind kind="item" checked={targets.kinds.includes('item')} />
        <TargetKind kind="location" checked={targets.kinds.includes('location')} />
      </div>
      {showsItemTypes(targets) && <ItemTypes targets={targets} />}
    </section>
  );
}
