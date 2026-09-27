import { Segmented } from '../frame/segmented.js';

import type { ReactElement } from 'react';

/** Renders the shared Connections and Fixtures count tabs without navigation. */
export function ConnectionsTabs({
  value,
  counts,
  onChange,
}: {
  value: 'connections' | 'fixtures';
  counts: { connections: number | null; fixtures: number | null };
  onChange?: (value: 'connections' | 'fixtures') => void;
}): ReactElement {
  const segments = [
    {
      id: 'connections' as const,
      label: 'Connections',
      count: counts.connections ?? undefined,
    },
    {
      id: 'fixtures' as const,
      label: 'Fixtures',
      count: counts.fixtures ?? undefined,
    },
  ];
  return (
    <Segmented
      label="Connections and fixtures"
      value={value}
      onChange={onChange}
      segments={segments}
    />
  );
}
