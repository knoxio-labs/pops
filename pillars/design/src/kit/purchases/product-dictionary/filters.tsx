import { Button, Select } from '@pops/ui';

import { ANY_SOURCE } from './types';

import type { ReactElement } from 'react';

import type { AssertionFilter, DictionaryFilterState } from './types';

const ASSERTIONS: readonly { value: AssertionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'asserted', label: 'Asserted' },
  { value: 'unasserted', label: 'Unfinished' },
];

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
 * has confirmed or corrected. Its complement is not "the rest of the list":
 * a product with one asserted wording and one proposal is unfinished, so it
 * answers `unasserted` and stays where the work is.
 */
export function DictionaryFilters({
  value,
  sources,
  onChange,
}: DictionaryFiltersProps): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Assertion filter" className="flex gap-2">
        {ASSERTIONS.map((assertion) => (
          <Button
            key={assertion.value}
            size="sm"
            variant={value.assertion === assertion.value ? 'default' : 'outline'}
            aria-pressed={value.assertion === assertion.value}
            onClick={() => onChange({ ...value, assertion: assertion.value })}
          >
            {assertion.label}
          </Button>
        ))}
      </div>

      <Select
        aria-label="Source"
        containerClassName="max-w-xs"
        value={value.source}
        options={[
          { value: ANY_SOURCE, label: 'Every source' },
          ...sources.map((source) => ({ value: source, label: source })),
        ]}
        onChange={(event) => onChange({ ...value, source: event.target.value })}
      />
    </div>
  );
}
