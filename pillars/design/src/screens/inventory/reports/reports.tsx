import { coreWorld } from '@/fixtures/inventory/core';
import { REPORT_NOW, reportEntriesFixture as entries } from '@/fixtures/inventory/reports';
import { OverviewTab } from '@/kit/inventory/reports/overview-tab';
import { ReportsPage } from '@/kit/inventory/reports/reports-shell';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { OverviewTabProps } from '@/kit/inventory/reports/overview-tab';
import type { PageBanner } from '@/kit/inventory/secondary-page';

export const meta: ScreenMeta = { title: 'Reports', order: 70, frame: 'web' };

function page(overrides: Partial<OverviewTabProps> = {}, banner?: PageBanner) {
  return function ReportsOverviewState() {
    const tab = { entries, world: coreWorld, now: REPORT_NOW, ...overrides };
    const empty = tab.entries.length === 0 || tab.status === 'loading' || tab.status === 'error';
    return (
      <ReportsPage
        tab="overview"
        banner={banner}
        exportBlocked={empty ? 'Nothing to export yet.' : undefined}
      >
        <OverviewTab {...tab} />
      </ReportsPage>
    );
  };
}

/**
 * `/inventory/reports`, Overview tab: the figures and three short panels,
 * each opening the tab that holds its detail.
 */
export const states: ScreenStates = {
  empty: page({ entries: [] }),
  loading: page({ status: 'loading' }),
  error: page({ status: 'error' }),
  stale: page({}, 'stale'),
  offline: page({}, 'offline'),
};

export default page();
