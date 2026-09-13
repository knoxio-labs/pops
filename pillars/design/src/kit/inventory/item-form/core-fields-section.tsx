/**
 * Port of
 * `pillars/inventory/app/src/pages/item-form-page/sections/CoreFieldsSection.tsx`.
 */
import { BasicInfoSection } from './core-fields/basic-info-section';
import { ClassificationSection } from './core-fields/classification-section';
import { DatesAndValuesSection } from './core-fields/dates-and-values-section';
import { type ItemFormValues } from './types';

import type { LocationNode } from '@/fixtures/inventory-locations';

export interface CoreFieldsSectionProps {
  values: ItemFormValues;
  errors: { itemName?: string; type?: string };
  assetIdError: string | null;
  assetIdChecking: boolean;
  generating: boolean;
  locationTree: LocationNode[];
  onAutoGenerate: () => void;
  onValidateAssetId: (value: string) => void;
  onCreateLocation: (name: string, parentId: string | null) => void;
  onChange: <K extends keyof ItemFormValues>(field: K, value: ItemFormValues[K]) => void;
}

function BasicInfoSlot({
  values,
  errors,
  assetIdError,
  assetIdChecking,
  generating,
  onAutoGenerate,
  onValidateAssetId,
  onChange,
}: CoreFieldsSectionProps) {
  return (
    <BasicInfoSection
      itemName={values.itemName}
      brand={values.brand}
      model={values.model}
      itemId={values.itemId}
      assetId={values.assetId}
      itemNameError={errors.itemName}
      assetIdError={assetIdError}
      assetIdChecking={assetIdChecking}
      generating={generating}
      typeValue={values.type}
      onChangeItemName={(v) => onChange('itemName', v)}
      onChangeBrand={(v) => onChange('brand', v)}
      onChangeModel={(v) => onChange('model', v)}
      onChangeItemId={(v) => onChange('itemId', v)}
      onChangeAssetId={(v) => onChange('assetId', v)}
      onAutoGenerate={onAutoGenerate}
      onValidateAssetId={onValidateAssetId}
    />
  );
}

function ClassificationSlot({
  values,
  errors,
  locationTree,
  onCreateLocation,
  onChange,
}: CoreFieldsSectionProps) {
  return (
    <ClassificationSection
      type={values.type}
      condition={values.condition}
      locationId={values.locationId}
      inUse={values.inUse}
      deductible={values.deductible}
      typeError={errors.type}
      locationTree={locationTree}
      onChangeType={(v) => onChange('type', v)}
      onChangeCondition={(v) => onChange('condition', v)}
      onChangeLocationId={(v) => onChange('locationId', v)}
      onChangeInUse={(v) => onChange('inUse', v)}
      onChangeDeductible={(v) => onChange('deductible', v)}
      onCreateLocation={onCreateLocation}
    />
  );
}

function DatesAndValuesSlot({ values, onChange }: CoreFieldsSectionProps) {
  return (
    <DatesAndValuesSection
      purchaseDate={values.purchaseDate}
      warrantyExpires={values.warrantyExpires}
      purchasePrice={values.purchasePrice}
      replacementValue={values.replacementValue}
      resaleValue={values.resaleValue}
      onChangePurchaseDate={(v) => onChange('purchaseDate', v)}
      onChangeWarrantyExpires={(v) => onChange('warrantyExpires', v)}
      onChangePurchasePrice={(v) => onChange('purchasePrice', v)}
      onChangeReplacementValue={(v) => onChange('replacementValue', v)}
      onChangeResaleValue={(v) => onChange('resaleValue', v)}
    />
  );
}

export function CoreFieldsSection(props: CoreFieldsSectionProps) {
  return (
    <>
      <BasicInfoSlot {...props} />
      <ClassificationSlot {...props} />
      <DatesAndValuesSlot {...props} />
    </>
  );
}
