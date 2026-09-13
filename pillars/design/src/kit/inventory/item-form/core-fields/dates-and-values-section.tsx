/**
 * Port of
 * `pillars/inventory/app/src/pages/item-form-page/sections/core-fields/DatesAndValuesSection.tsx`.
 */
import { DateInput, FieldLabel, TextInput } from '@pops/ui';

export interface DatesAndValuesSectionProps {
  purchaseDate: string;
  warrantyExpires: string;
  purchasePrice: string;
  replacementValue: string;
  resaleValue: string;
  onChangePurchaseDate: (value: string) => void;
  onChangeWarrantyExpires: (value: string) => void;
  onChangePurchasePrice: (value: string) => void;
  onChangeReplacementValue: (value: string) => void;
  onChangeResaleValue: (value: string) => void;
}

function DateFields({
  purchaseDate,
  warrantyExpires,
  onChangePurchaseDate,
  onChangeWarrantyExpires,
}: Pick<
  DatesAndValuesSectionProps,
  'purchaseDate' | 'warrantyExpires' | 'onChangePurchaseDate' | 'onChangeWarrantyExpires'
>) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <FieldLabel htmlFor="purchaseDate" label="Purchase Date" />
        <DateInput
          id="purchaseDate"
          name="purchaseDate"
          value={purchaseDate}
          onChange={(e) => onChangePurchaseDate(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel htmlFor="warrantyExpires" label="Warranty Expires" />
        <DateInput
          id="warrantyExpires"
          name="warrantyExpires"
          value={warrantyExpires}
          onChange={(e) => onChangeWarrantyExpires(e.target.value)}
        />
      </div>
    </div>
  );
}

function MoneyField({
  id,
  label,
  value,
  onChange,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={id} label={label} />
      <TextInput
        id={id}
        name={id}
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className={className}
      />
    </div>
  );
}

function ValueFields({
  purchasePrice,
  replacementValue,
  resaleValue,
  onChangePurchasePrice,
  onChangeReplacementValue,
  onChangeResaleValue,
}: Pick<
  DatesAndValuesSectionProps,
  | 'purchasePrice'
  | 'replacementValue'
  | 'resaleValue'
  | 'onChangePurchasePrice'
  | 'onChangeReplacementValue'
  | 'onChangeResaleValue'
>) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <MoneyField
        id="purchasePrice"
        label="Purchase Price ($)"
        value={purchasePrice}
        onChange={onChangePurchasePrice}
      />
      <MoneyField
        id="replacementValue"
        label="Replacement Value ($)"
        value={replacementValue}
        onChange={onChangeReplacementValue}
        className="font-bold text-app-accent"
      />
      <MoneyField
        id="resaleValue"
        label="Resale Value ($)"
        value={resaleValue}
        onChange={onChangeResaleValue}
      />
    </div>
  );
}

export function DatesAndValuesSection(props: DatesAndValuesSectionProps) {
  return (
    <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
      <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
        Dates & Values
      </h2>
      <DateFields {...props} />
      <ValueFields {...props} />
    </section>
  );
}
