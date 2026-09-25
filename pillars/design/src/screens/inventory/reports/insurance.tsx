import { coreWorld } from '@/fixtures/inventory/core';
import { reportEntriesFixture as entries } from '@/fixtures/inventory/reports';
import { InsuranceTab } from '@/kit/inventory/reports/insurance-tab';
import { ReportsPage } from '@/kit/inventory/reports/reports-shell';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { InsuranceTabProps } from '@/kit/inventory/reports/insurance-tab';

export const meta: ScreenMeta = { title: 'Insurance', order: 73, frame: 'web' };

function page(overrides: Partial<InsuranceTabProps> = {}) {
  return function ReportsInsuranceState() {
    return (
      <ReportsPage tab="insurance">
        <InsuranceTab entries={entries} world={coreWorld} {...overrides} />
      </ReportsPage>
    );
  };
}

/**
 * `/inventory/reports?tab=insurance`: the insurance schedule, by room, with
 * gaps tinted. Export CSV and Print take what the controls leave showing.
 */
export const states: ScreenStates = {
  'one-place': page({ options: { scopeId: 'loc-garage' } }),
  'gaps-only': page({ options: { gapsOnly: true } }),
  'by-name': page({ options: { sort: 'name' } }),
  'paperless-down': page({ paperlessDown: true }),
  'empty-filtered': page({ options: { scopeId: 'loc-wardrobe', gapsOnly: true } }),
  empty: page({ entries: [] }),
  loading: page({ status: 'loading' }),
  error: page({ status: 'error' }),
};

export default page();
