import { DateInput, FieldLabel, TextInput } from '@pops/ui';

import { type ItemFormValues } from '../../useItemFormPageModel';

import type { UseFormRegister } from 'react-hook-form';

interface DatesAndValuesSectionProps {
  register: UseFormRegister<ItemFormValues>;
}

export function DatesAndValuesSection({ register }: DatesAndValuesSectionProps) {
  return (
    <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
      <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
        Dates & Values
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="purchaseDate" label="Purchase Date" />
          <DateInput id="purchaseDate" {...register('purchaseDate')} />
        </div>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="warrantyExpires" label="Warranty Expires" />
          <DateInput id="warrantyExpires" {...register('warrantyExpires')} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="purchasePrice" label="Purchase Price ($)" />
          <TextInput
            id="purchasePrice"
            type="number"
            step="0.01"
            min="0"
            {...register('purchasePrice')}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="replacementValue" label="Replacement Value ($)" />
          <TextInput
            id="replacementValue"
            type="number"
            step="0.01"
            min="0"
            {...register('replacementValue')}
            placeholder="0.00"
            className="font-bold text-app-accent"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="resaleValue" label="Resale Value ($)" />
          <TextInput
            id="resaleValue"
            type="number"
            step="0.01"
            min="0"
            {...register('resaleValue')}
            placeholder="0.00"
          />
        </div>
      </div>
    </section>
  );
}
