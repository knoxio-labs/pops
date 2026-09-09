import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Autocomplete, type AutocompleteSuggestion } from '@pops/ui';

export interface SlugSearchItem {
  slug: string;
  kind: 'ingredient' | 'recipe' | 'prep_state';
  targetId: number;
  name: string;
}

function suggestionKey(item: Pick<SlugSearchItem, 'kind' | 'targetId'>): string {
  return `${item.kind}-${item.targetId}`;
}

export function IngredientAutocomplete({
  inputId,
  query,
  setQuery,
  matches,
  onPick,
}: {
  inputId: string;
  query: string;
  setQuery: (s: string) => void;
  matches: readonly SlugSearchItem[];
  onPick: (item: SlugSearchItem) => void;
}) {
  const { t } = useTranslation('food');
  const suggestions = useMemo<AutocompleteSuggestion[]>(
    () =>
      matches.map((m) => ({
        value: suggestionKey(m),
        label: m.name || m.slug,
        description: m.slug,
      })),
    [matches]
  );
  return (
    <Autocomplete
      id={inputId}
      suggestions={suggestions}
      value={query}
      onChange={setQuery}
      onSelect={(suggestion) => {
        const item = matches.find((m) => suggestionKey(m) === suggestion.value);
        if (item) onPick(item);
      }}
      placeholder={t('data.substitutions.endpoint.searchPlaceholder')}
      emptyMessage={t('data.substitutions.endpoint.noMatches')}
    />
  );
}
