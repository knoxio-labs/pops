import { Checkbox, Input, Label } from '@pops/ui';

import { useFieldFormContext } from './FieldFormContext';

/** Renders kind-specific unit and reference constraints for a field. */
export function FieldFormConstraints() {
  const value = useFieldFormContext();
  if (value.kind === 'measurement')
    return (
      <div className="space-y-2">
        <Label htmlFor="catalogue-fixed-unit">Fixed unit</Label>
        <Input
          id="catalogue-fixed-unit"
          value={value.fixedUnit}
          disabled={value.shapeLocked}
          onChange={(event) => value.setFixedUnit(event.target.value)}
        />
      </div>
    );
  if (value.kind !== 'reference') return null;
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h4 className="font-medium">Reference targets</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['item', 'location'] as const).map((kind) => (
          <ReferenceKind key={kind} kind={kind} />
        ))}
      </div>
      {value.referenceKinds.includes('item') && <ReferenceTypes />}
    </section>
  );
}

function ReferenceKind({ kind }: { readonly kind: 'item' | 'location' }) {
  const { referenceKinds, setReferenceKinds, shapeLocked } = useFieldFormContext();
  const toggle = (checked: boolean) =>
    setReferenceKinds((current) =>
      checked ? [...new Set([...current, kind])] : current.filter((entry) => entry !== kind)
    );
  return (
    <Label
      htmlFor={`reference-kind-${kind}`}
      className="flex min-h-11 items-center gap-2 rounded-lg border px-3 font-normal"
    >
      <Checkbox
        id={`reference-kind-${kind}`}
        checked={referenceKinds.includes(kind)}
        disabled={shapeLocked}
        onCheckedChange={(checked) => toggle(checked === true)}
      />
      {kind === 'item' ? 'Inventory item' : 'Location'}
    </Label>
  );
}

function ReferenceTypes() {
  const { referenceTypeIds, setReferenceTypeIds, shapeLocked, types } = useFieldFormContext();
  return (
    <div className="space-y-2">
      <Label>Allowed item types</Label>
      {types
        .filter((type) => type.archivedAt === null)
        .map((type) => (
          <Label
            key={type.id}
            htmlFor={`reference-type-${type.id}`}
            className="flex min-h-11 items-center gap-3 font-normal"
          >
            <Checkbox
              id={`reference-type-${type.id}`}
              checked={referenceTypeIds.includes(type.id)}
              disabled={shapeLocked}
              onCheckedChange={(checked) =>
                setReferenceTypeIds((current) =>
                  checked === true
                    ? [...new Set([...current, type.id])]
                    : current.filter((id) => id !== type.id)
                )
              }
            />
            {type.label}
          </Label>
        ))}
    </div>
  );
}
