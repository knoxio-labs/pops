import { catalogueTypes, connectorOptions } from '@/fixtures/inventory-type-catalogue';
import { Link2, ListPlus, GripVertical } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Label,
  RadioGroup,
  RadioGroupItem,
  cn,
} from '@pops/ui';

/** Enum option management including published-use counts and retired values. */
export function EnumOptions() {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Options</h3>
          <p className="text-sm text-muted-foreground">
            Retired options remain readable on existing items.
          </p>
        </div>
        <Button variant="outline" size="sm">
          <ListPlus className="h-4 w-4" />
          Add option
        </Button>
      </div>
      <div className="divide-y rounded-lg border">
        {connectorOptions.map((option) => (
          <div key={option.id} className="flex min-h-11 items-center gap-3 px-3 py-2">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className={cn('block text-sm font-medium', option.retired && 'line-through')}>
                {option.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {option.key} · {option.itemCount} items
              </span>
            </span>
            {option.retired ? (
              <Badge variant="outline">Retired</Badge>
            ) : (
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ItemTypeTargets() {
  return (
    <div className="space-y-2">
      <Label>Allowed item types</Label>
      <div className="space-y-2 rounded-lg border p-3">
        {catalogueTypes
          .filter((type) => type.status !== 'archived')
          .map((type) => (
            <Label
              key={type.id}
              htmlFor={`type-${type.id}`}
              className="flex min-h-11 items-center gap-3 font-normal"
            >
              <Checkbox id={`type-${type.id}`} defaultChecked={type.id !== 'type-appliance'} />
              <span className="flex-1">{type.label}</span>
              <span className="text-xs text-muted-foreground">{type.itemCount} items</span>
            </Label>
          ))}
      </div>
    </div>
  );
}

/** Reference target kind and allowed item-type constraints. */
export function ReferenceTargets() {
  return (
    <section className="space-y-4">
      <Alert>
        <Link2 />
        <AlertTitle>Reference identity survives deletion</AlertTitle>
        <AlertDescription>
          A deleted or not-yet-synced target stays visible by identity instead of clearing this
          field.
        </AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label>Target kind</Label>
        <RadioGroup defaultValue="item" className="grid gap-2 sm:grid-cols-2">
          <Label
            htmlFor="target-item"
            className="flex min-h-11 items-center gap-2 rounded-lg border px-3 font-normal"
          >
            <RadioGroupItem id="target-item" value="item" /> Inventory item
          </Label>
          <Label
            htmlFor="target-location"
            className="flex min-h-11 items-center gap-2 rounded-lg border px-3 font-normal"
          >
            <RadioGroupItem id="target-location" value="location" /> Location
          </Label>
        </RadioGroup>
      </div>
      <ItemTypeTargets />
    </section>
  );
}
