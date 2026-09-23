import { catalogueTypes, connectorOptions } from '@/fixtures/inventory-type-catalogue';
import { Link2 } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Badge, Checkbox, Input, Label } from '@pops/ui';

import type { CatalogueFieldKind } from '@/fixtures/inventory-type-fields';

function MeasurementSettings() {
  return (
    <section className="space-y-2 rounded-lg border p-4">
      <Label htmlFor="measurement-unit">Fixed unit</Label>
      <Input id="measurement-unit" defaultValue="V" className="min-h-11" />
      <p className="text-xs text-muted-foreground">
        Values use this exact unit. Changing it later requires a replacement field and migration.
      </p>
    </section>
  );
}

function EnumSettings() {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="font-medium">Options</h3>
        <p className="text-sm text-muted-foreground">
          Published identities remain stable when a label changes or an option retires.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {connectorOptions.map((option) => (
          <Badge key={option.id} variant="outline">
            {option.label}
            {option.retired ? ' · retired' : ''}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function ReferenceSettings() {
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <Alert>
        <Link2 />
        <AlertTitle>Items and locations are both allowed</AlertTitle>
        <AlertDescription>
          Each value keeps its target kind and identity. Deleted or unsynced targets remain
          representable instead of clearing the field.
        </AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label>Allowed target kinds</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Label
            htmlFor="reference-kind-item"
            className="flex min-h-11 items-center gap-3 rounded-lg border px-3 font-normal"
          >
            <Checkbox id="reference-kind-item" defaultChecked /> Inventory item
          </Label>
          <Label
            htmlFor="reference-kind-location"
            className="flex min-h-11 items-center gap-3 rounded-lg border px-3 font-normal"
          >
            <Checkbox id="reference-kind-location" defaultChecked /> Location
          </Label>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Allowed item types</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {catalogueTypes
            .filter((type) => type.status !== 'archived')
            .map((type) => (
              <Label
                key={type.id}
                htmlFor={`reference-type-${type.id}`}
                className="flex min-h-11 items-center gap-3 rounded-lg border px-3 font-normal"
              >
                <Checkbox id={`reference-type-${type.id}`} defaultChecked />
                <span className="flex-1">{type.label}</span>
                <span className="text-xs text-muted-foreground">{type.itemCount}</span>
              </Label>
            ))}
        </div>
      </div>
    </section>
  );
}

/** Renders constraints that exist only for enum, measurement, or reference fields. */
export function KindSettings({ kind }: { kind: CatalogueFieldKind }) {
  if (kind === 'measurement') return <MeasurementSettings />;
  if (kind === 'enum') return <EnumSettings />;
  if (kind === 'reference') return <ReferenceSettings />;
  return null;
}
