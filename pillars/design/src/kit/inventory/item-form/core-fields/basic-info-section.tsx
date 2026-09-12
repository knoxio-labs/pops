/**
 * Port of
 * `pillars/inventory/app/src/pages/item-form-page/sections/core-fields/BasicInfoSection.tsx`.
 *
 * The source wires its inputs with react-hook-form's `register`; the canvas
 * holds the draft in plain `useState` (see `use-item-form-state.ts`), so each
 * field takes a `value`/`onChange` pair instead of a `register` spread. The
 * rendered markup, classNames and copy are otherwise unchanged.
 */
import { Loader2, Wand2 } from 'lucide-react';

import { Button, FieldLabel, fieldLabelDescribedBy, TextInput } from '@pops/ui';

import { extractPrefix } from '../types';

export interface BasicInfoSectionProps {
  itemName: string;
  brand: string;
  model: string;
  itemId: string;
  assetId: string;
  itemNameError?: string;
  assetIdError: string | null;
  assetIdChecking: boolean;
  generating: boolean;
  typeValue: string;
  onChangeItemName: (value: string) => void;
  onChangeBrand: (value: string) => void;
  onChangeModel: (value: string) => void;
  onChangeItemId: (value: string) => void;
  onChangeAssetId: (value: string) => void;
  onAutoGenerate: () => void;
  onValidateAssetId: (value: string) => void;
}

function AssetIdField({
  assetId,
  assetIdError,
  assetIdChecking,
  generating,
  typeValue,
  onChangeAssetId,
  onAutoGenerate,
  onValidateAssetId,
}: Pick<
  BasicInfoSectionProps,
  | 'assetId'
  | 'assetIdError'
  | 'assetIdChecking'
  | 'generating'
  | 'typeValue'
  | 'onChangeAssetId'
  | 'onAutoGenerate'
  | 'onValidateAssetId'
>) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <TextInput
          id="assetId"
          name="assetId"
          aria-invalid={!!assetIdError}
          aria-describedby={fieldLabelDescribedBy('assetId', { error: assetIdError ?? undefined })}
          value={assetId}
          onChange={(e) => onChangeAssetId(e.target.value)}
          className="font-mono"
          onBlur={(e) => onValidateAssetId(e.target.value)}
        />
        {assetIdChecking && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!typeValue || generating}
        onClick={onAutoGenerate}
        className="shrink-0 whitespace-nowrap"
        title={typeValue ? `Generate ${extractPrefix(typeValue)}XX` : 'Select a type first'}
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className="h-4 w-4 mr-1" />
        )}
        Auto-generate
      </Button>
    </div>
  );
}

function ItemNameField({
  itemName,
  itemNameError,
  onChangeItemName,
}: Pick<BasicInfoSectionProps, 'itemName' | 'itemNameError' | 'onChangeItemName'>) {
  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor="itemName" label="Item Name" required error={itemNameError} />
      <TextInput
        id="itemName"
        name="itemName"
        aria-invalid={!!itemNameError}
        aria-describedby={fieldLabelDescribedBy('itemName', { error: itemNameError })}
        value={itemName}
        onChange={(e) => onChangeItemName(e.target.value)}
        placeholder="e.g. MacBook Pro 16-inch"
        className="font-semibold"
      />
    </div>
  );
}

function BrandModelFields({
  brand,
  model,
  onChangeBrand,
  onChangeModel,
}: Pick<BasicInfoSectionProps, 'brand' | 'model' | 'onChangeBrand' | 'onChangeModel'>) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <FieldLabel htmlFor="brand" label="Brand" />
        <TextInput
          id="brand"
          name="brand"
          value={brand}
          onChange={(e) => onChangeBrand(e.target.value)}
          placeholder="e.g. Apple"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="model" label="Model" />
        <TextInput
          id="model"
          name="model"
          value={model}
          onChange={(e) => onChangeModel(e.target.value)}
          placeholder="e.g. M3 Max"
        />
      </div>
    </div>
  );
}

function IdFields(props: BasicInfoSectionProps) {
  const { itemId, assetIdError, onChangeItemId } = props;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <FieldLabel htmlFor="itemId" label="Item ID / SKU" />
        <TextInput
          id="itemId"
          name="itemId"
          value={itemId}
          onChange={(e) => onChangeItemId(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="assetId" label="Asset ID" error={assetIdError ?? undefined} />
        <AssetIdField {...props} />
      </div>
    </div>
  );
}

export function BasicInfoSection(props: BasicInfoSectionProps) {
  return (
    <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
      <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
        Basic Information
      </h2>
      <ItemNameField {...props} />
      <BrandModelFields {...props} />
      <IdFields {...props} />
    </section>
  );
}
