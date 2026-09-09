import { useTranslation } from 'react-i18next';

import { Select, type SelectOption } from '@pops/ui';

export interface VariantOption {
  id: number;
  slug: string;
  name: string;
}

export function VariantDropdown({
  variants,
  selectId,
  onPick,
}: {
  variants: readonly VariantOption[];
  selectId: string;
  onPick: (variantId: number) => void;
}) {
  const { t } = useTranslation('food');
  if (variants.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">{t('data.substitutions.endpoint.noVariants')}</p>
    );
  }
  const options: SelectOption[] = [
    { value: '', label: t('data.substitutions.endpoint.variantPickerPlaceholder'), disabled: true },
    ...variants.map((v) => ({ value: String(v.id), label: `${v.name} (${v.slug})` })),
  ];
  return (
    <Select
      id={selectId}
      onChange={(e) => {
        const id = Number(e.target.value);
        if (Number.isFinite(id) && id > 0) onPick(id);
      }}
      defaultValue=""
      options={options}
      aria-label={t('data.substitutions.endpoint.variantPickerAria')}
    />
  );
}
