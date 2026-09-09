/**
 * Header filter bar for `/food/solve`.
 *
 * Four controls: a "No substitutions" toggle, multi-select recipe-type
 * chips, multi-select tag chips, and a max-time dropdown. Every filter
 * is optional; clearing them all is the equivalent of unfiltered.
 *
 * The tags control passes no `suggestions` to `ChipInput`, so it stays
 * free-text: the food contract exposes no tag-taxonomy read surface, and a
 * discoverable dropdown would have nothing to enumerate from.
 */
import { useTranslation } from 'react-i18next';

import { Button, CheckboxInput, ChipInput, Select, type SelectOption } from '@pops/ui';

import type { ReactElement } from 'react';

import type { SolveFilterState } from './useSolveResult.js';

const RECIPE_TYPES = [
  'plate',
  'component',
  'sauce',
  'dressing',
  'drink',
  'condiment',
  'technique',
] as const;

const MAX_TIME_CHOICES = [15, 30, 45, 60] as const;

interface SolveFiltersProps {
  filters: SolveFilterState;
  onChange: (next: SolveFilterState) => void;
}

export function SolveFilters({ filters, onChange }: SolveFiltersProps): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <NoSubsToggle filters={filters} onChange={onChange} />
      <RecipeTypeChips filters={filters} onChange={onChange} />
      <TagsInput filters={filters} onChange={onChange} />
      <MaxTimeSelect filters={filters} onChange={onChange} />
    </div>
  );
}

function NoSubsToggle({ filters, onChange }: SolveFiltersProps): ReactElement {
  const { t } = useTranslation('food');
  return (
    <CheckboxInput
      label={t('solve.filters.noSubstitutions')}
      checked={filters.excludeSubs}
      onCheckedChange={(excludeSubs) => onChange({ ...filters, excludeSubs })}
    />
  );
}

function RecipeTypeChips({ filters, onChange }: SolveFiltersProps): ReactElement {
  const { t } = useTranslation('food');
  function toggle(type: (typeof RECIPE_TYPES)[number]): void {
    const next = new Set(filters.recipeTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange({ ...filters, recipeTypes: [...next] });
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {RECIPE_TYPES.map((type) => {
        const active = filters.recipeTypes.includes(type);
        return (
          <Button
            key={type}
            variant={active ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggle(type)}
          >
            {t(`solve.filters.recipeType.${type}`)}
          </Button>
        );
      })}
    </div>
  );
}

function TagsInput({ filters, onChange }: SolveFiltersProps): ReactElement {
  const { t } = useTranslation('food');
  return (
    <div className="flex items-center gap-2 text-sm">
      <span id="solve-tags-label">{t('solve.filters.tags')}</span>
      <ChipInput
        aria-labelledby="solve-tags-label"
        placeholder={t('solve.filters.tagsPlaceholder')}
        value={[...filters.tags]}
        onChange={(tags) => onChange({ ...filters, tags })}
        containerClassName="w-64"
      />
    </div>
  );
}

function MaxTimeSelect({ filters, onChange }: SolveFiltersProps): ReactElement {
  const { t } = useTranslation('food');
  const options: SelectOption[] = [
    { value: '', label: t('solve.filters.maxTimeAny') },
    ...MAX_TIME_CHOICES.map((mins) => ({
      value: String(mins),
      label: t('solve.filters.maxTimeOption', { minutes: mins }),
    })),
  ];
  return (
    <Select
      label={t('solve.filters.maxTime')}
      value={filters.maxMinutes === null ? '' : String(filters.maxMinutes)}
      onChange={(e) =>
        onChange({
          ...filters,
          maxMinutes: e.target.value === '' ? null : Number(e.target.value),
        })
      }
      options={options}
      className="w-44"
    />
  );
}
