import { coreWorld } from '@/fixtures/inventory/core';
import { reportEntriesFixture as entries } from '@/fixtures/inventory/reports';
import { ReportsPage } from '@/kit/inventory/reports/reports-shell';
import { ValuesTab } from '@/kit/inventory/reports/values-tab';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ValuesTabProps } from '@/kit/inventory/reports/values-tab';

export const meta: ScreenMeta = { title: 'Reports: values', order: 2, frame: 'web' };

function page(overrides: Partial<ValuesTabProps> = {}) {
  return function ReportsValuesState() {
    return (
      <ReportsPage tab="values">
        <ValuesTab entries={entries} world={coreWorld} {...overrides} />
      </ReportsPage>
    );
  };
}

/** `/inventory/reports?tab=values`: value by room or type, on either basis. */
export const states: ScreenStates = {
  'by-type': page({ by: 'type' }),
  'price-paid': page({ basis: 'purchase' }),
  'group-with-gaps': page({ groupKey: 'loc-kitchen' }),
  empty: page({ entries: [] }),
  loading: page({ status: 'loading' }),
  error: page({ status: 'error' }),
};

export default page();
