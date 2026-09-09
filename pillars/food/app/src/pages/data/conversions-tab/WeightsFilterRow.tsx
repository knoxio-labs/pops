/**
 * Search/filter row for `WeightsSection` — split out to keep that file
 * under the `max-lines` budget.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox, Label, Select, type SelectOption, TextInput } from '@pops/ui';

import { type IngredientOption } from './CreateWeightDialog';

export function useWeightFilters() {
  const [search, setSearch] = useState('');
  const [seededOnly, setSeededOnly] = useState(false);
  const [ingredientFilter, setIngredientFilter] = useState<string>('');
  return { search, setSearch, seededOnly, setSeededOnly, ingredientFilter, setIngredientFilter };
}

function ingredientFilterOptions(
  ingredients: readonly IngredientOption[],
  t: (key: string) => string
): SelectOption[] {
  return [
    { value: '', label: t('data.conversions.weights.allIngredients') },
    ...ingredients.map((i) => ({ value: String(i.id), label: `${i.name} (${i.slug})` })),
  ];
}

export function WeightsFilterRow({
  search,
  onSearchChange,
  seededOnly,
  onSeededOnlyChange,
  ingredientFilter,
  onIngredientFilterChange,
  ingredients,
}: {
  search: string;
  onSearchChange: (next: string) => void;
  seededOnly: boolean;
  onSeededOnlyChange: (next: boolean) => void;
  ingredientFilter: string;
  onIngredientFilterChange: (next: string) => void;
  ingredients: readonly IngredientOption[];
}) {
  const { t } = useTranslation('food');
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid w-full max-w-xs gap-1.5">
        <Label htmlFor="weights-search">{t('data.conversions.weights.searchLabel')}</Label>
        <TextInput
          id="weights-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('data.conversions.weights.searchPlaceholder')}
        />
      </div>
      <div className="w-full max-w-xs">
        <Select
          id="weights-ingredient-filter"
          label={t('data.conversions.weights.ingredientFilter')}
          value={ingredientFilter}
          onChange={(e) => onIngredientFilterChange(e.target.value)}
          options={ingredientFilterOptions(ingredients, t)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="weights-seeded-only"
          checked={seededOnly}
          onCheckedChange={(next) => onSeededOnlyChange(next === true)}
        />
        <Label htmlFor="weights-seeded-only">{t('data.conversions.seededOnly')}</Label>
      </div>
    </div>
  );
}
