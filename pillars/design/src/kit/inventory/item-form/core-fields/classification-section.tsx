import { inventoryConditions } from '@/fixtures/inventory-items';
import { type LocationNode } from '@/fixtures/inventory-locations';
import { LocationPicker } from '@/kit/inventory/location-picker';

/**
 * Port of
 * `pillars/inventory/app/src/pages/item-form-page/sections/core-fields/ClassificationSection.tsx`.
 *
 * The source reads `INVENTORY_CONDITIONS` from `@pops/inventory`, which the
 * playground may not import; `inventoryConditions` from the item fixtures is
 * the same list. Checkboxes went through react-hook-form's `Controller`
 * there only to bridge `register()` to Radix's `checked`/`onCheckedChange`
 * API (#2175). With no `register` here, `CheckboxInput` is wired directly.
 */
import { CheckboxInput, FieldLabel, fieldLabelDescribedBy, Select } from '@pops/ui';

const ITEM_TYPES = [
  'Electronics',
  'Furniture',
  'Appliance',
  'Clothing',
  'Tools',
  'Sports',
  'Kitchen',
  'Office',
  'Other',
];
const CONDITIONS = inventoryConditions.map((c) => ({ value: c, label: c }));

export interface ClassificationSectionProps {
  type: string;
  condition: string;
  locationId: string;
  inUse: boolean;
  deductible: boolean;
  typeError?: string;
  locationTree: LocationNode[];
  onChangeType: (value: string) => void;
  onChangeCondition: (value: string) => void;
  onChangeLocationId: (value: string) => void;
  onChangeInUse: (value: boolean) => void;
  onChangeDeductible: (value: boolean) => void;
  onCreateLocation: (name: string, parentId: string | null) => void;
}

function TypeConditionFields({
  type,
  condition,
  typeError,
  onChangeType,
  onChangeCondition,
}: Pick<
  ClassificationSectionProps,
  'type' | 'condition' | 'typeError' | 'onChangeType' | 'onChangeCondition'
>) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <FieldLabel htmlFor="type" label="Type" required error={typeError} />
        <Select
          id="type"
          name="type"
          aria-invalid={!!typeError}
          aria-describedby={fieldLabelDescribedBy('type', { error: typeError })}
          value={type}
          onChange={(e) => onChangeType(e.target.value)}
          options={[
            { value: '', label: 'Select type...' },
            ...ITEM_TYPES.map((t) => ({ value: t, label: t })),
          ]}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="condition" label="Condition" />
        <Select
          id="condition"
          name="condition"
          value={condition}
          onChange={(e) => onChangeCondition(e.target.value)}
          options={[{ value: '', label: 'Select condition...' }, ...CONDITIONS]}
        />
      </div>
    </div>
  );
}

function LocationField({
  locationId,
  locationTree,
  onChangeLocationId,
  onCreateLocation,
}: Pick<
  ClassificationSectionProps,
  'locationId' | 'locationTree' | 'onChangeLocationId' | 'onCreateLocation'
>) {
  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor="locationId" label="Location" />
      <LocationPicker
        id="locationId"
        locations={locationTree}
        value={locationId || null}
        onChange={(id) => onChangeLocationId(id ?? '')}
        onCreateLocation={onCreateLocation}
        placeholder="Select location…"
      />
    </div>
  );
}

function ToggleFields({
  inUse,
  deductible,
  onChangeInUse,
  onChangeDeductible,
}: Pick<
  ClassificationSectionProps,
  'inUse' | 'deductible' | 'onChangeInUse' | 'onChangeDeductible'
>) {
  return (
    <div className="flex gap-6 p-4 rounded-xl bg-app-accent/5">
      <CheckboxInput label="In Use" checked={inUse} onCheckedChange={onChangeInUse} />
      <CheckboxInput
        label="Tax Deductible"
        checked={deductible}
        onCheckedChange={onChangeDeductible}
      />
    </div>
  );
}

export function ClassificationSection(props: ClassificationSectionProps) {
  return (
    <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
      <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
        Classification
      </h2>
      <TypeConditionFields {...props} />
      <LocationField {...props} />
      <ToggleFields {...props} />
    </section>
  );
}
