import { Select, TextInput } from '@pops/ui';

import type { JSX } from 'react';

import type { ArrangementFilters as Filters, ArrangementLabels, ArrangementRow } from './types';

/** Independent source-fact filters leave the full source collections unchanged. */
export function ArrangementFilters({
  value,
  onChange,
  labels,
}: {
  value: Filters;
  onChange: (filters: Filters) => void;
  labels: ArrangementLabels;
}): JSX.Element {
  const kinds: ArrangementRow['kind'][] = ['journey', 'stay', 'event', 'rental'];
  const purchases: Filters['purchase'][] = ['', 'purchased', 'not-purchased'];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <TextInput
        type="search"
        label={labels.search}
        className="min-h-11"
        value={value.query}
        onChange={(event) => onChange({ ...value, query: event.target.value })}
      />
      <Select
        label={labels.kind}
        className="min-h-11"
        value={value.kind}
        options={[
          { value: '', label: labels.allKinds },
          ...kinds.map((kind) => ({ value: kind, label: labels[kind] })),
        ]}
        onChange={(event) => {
          const kind = kinds.find((candidate) => candidate === event.target.value);
          onChange({ ...value, kind: kind ?? '' });
        }}
      />
      <Select
        label={labels.purchase}
        className="min-h-11"
        value={value.purchase}
        options={[
          { value: '', label: labels.allPurchases },
          { value: 'purchased', label: labels.sourceStates.Purchased },
          { value: 'not-purchased', label: labels.notPurchased },
        ]}
        onChange={(event) => {
          const purchase = purchases.find((candidate) => candidate === event.target.value);
          if (purchase !== undefined) onChange({ ...value, purchase });
        }}
      />
    </div>
  );
}
