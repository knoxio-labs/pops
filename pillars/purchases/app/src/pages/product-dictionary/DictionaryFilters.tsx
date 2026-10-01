import { useTranslation } from 'react-i18next';

import { Button, Select } from '@pops/ui';

import { ANY_SOURCE } from './types.js';

import type { ReactElement } from 'react';

import type { AssertionFilter, DictionaryFilterState } from './types.js';

const ASSERTIONS: readonly AssertionFilter[] = ['all', 'asserted', 'unasserted'];

interface DictionaryFiltersProps {
  value: DictionaryFilterState;
  /** Every source the loaded dictionary prints, not only the filtered ones. */
  sources: readonly string[];
  onChange: (next: DictionaryFilterState) => void;
}

/**
 * The two axes the dictionary is worth narrowing on: where a wording was
 * printed, and whether anybody has vouched for it.
 *
 * `unasserted` is the triage view — everything the pass proposed and nobody
 * has confirmed or corrected — and it is the reason the assertion filter
 * exists at all. Its complement is not "the rest of the list": a product with
 * one asserted wording and one proposal is unfinished, so it answers
 * `unasserted` and stays where the work is.
 */
export function DictionaryFilters({
  value,
  sources,
  onChange,
}: DictionaryFiltersProps): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label={t('products.filter.assertionLabel')} className="flex gap-2">
        {ASSERTIONS.map((assertion) => (
          <Button
            key={assertion}
            size="sm"
            variant={value.assertion === assertion ? 'default' : 'outline'}
            aria-pressed={value.assertion === assertion}
            onClick={() => onChange({ ...value, assertion })}
          >
            {t(`products.filter.assertion.${assertion}`)}
          </Button>
        ))}
      </div>

      <Select
        aria-label={t('products.filter.sourceLabel')}
        containerClassName="max-w-xs"
        value={value.source}
        options={[
          { value: ANY_SOURCE, label: t('products.filter.source.all') },
          ...sources.map((source) => ({ value: source, label: source })),
        ]}
        onChange={(event) => onChange({ ...value, source: event.target.value })}
      />
    </div>
  );
}
