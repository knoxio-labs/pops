import { coreWorld } from '@/fixtures/inventory/core';
import { REPORT_NOW, reportEntriesFixture as entries } from '@/fixtures/inventory/reports';
import { ReportsPage } from '@/kit/inventory/reports/reports-shell';
import { WarrantiesTab } from '@/kit/inventory/reports/warranties-tab';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { WarrantiesTabProps } from '@/kit/inventory/reports/warranties-tab';

export const meta: ScreenMeta = { title: 'Warranties', order: 72, frame: 'web' };

function page(overrides: Partial<WarrantiesTabProps> = {}) {
  return function ReportsWarrantiesState() {
    return (
      <ReportsPage tab="warranties">
        <WarrantiesTab entries={entries} world={coreWorld} now={REPORT_NOW} {...overrides} />
      </ReportsPage>
    );
  };
}

/**
 * `/inventory/reports?tab=warranties`: the old Warranties page, now a tab.
 * Segments by how soon a warranty ends; receipts open in Paperless.
 */
export const states: ScreenStates = {
  quarter: page({ tier: 'quarter' }),
  later: page({ tier: 'later' }),
  expired: page({ tier: 'expired' }),
  'paperless-down': page({ paperlessDown: true }),
  empty: page({ entries: [] }),
  loading: page({ status: 'loading' }),
  error: page({ status: 'error' }),
};

export default page();
