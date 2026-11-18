import { useTranslation } from 'react-i18next';

import type { OverviewLabels } from '@pops/trips-workspace';

/** Translate Timeline controls and exact source labels through the owning host catalogue. */
export function useOverviewLabels(): OverviewLabels {
  const { t } = useTranslation('trips');
  return {
    trip: t('trip'),
    route: t('overview.route'),
    journeys: t('overview.journeys'),
    unassociated: t('overview.unassociated'),
    decisions: t('overview.decisions'),
    documents: t('overview.documents'),
    notes: t('notes'),
    empty: t('overview.empty'),
    loading: t('overview.loading'),
    unavailable: t('overview.unavailable'),
    retry: t('retry'),
    settings: t('settings'),
    current: t('overview.current'),
    alternatives: t('overview.alternatives'),
    selected: t('overview.selected'),
    unresolved: t('overview.unresolved'),
    sheet: {
      title: t('overview.sheet.title'),
      journey: t('overview.sheet.journey'),
      when: t('overview.sheet.when'),
      what: t('overview.sheet.what'),
      state: t('overview.sheet.state'),
      with: t('overview.sheet.with'),
      originals: t('overview.sheet.originals'),
      originalsUnknown: t('overview.sheet.originalsUnknown'),
      ownerUnknown: t('overview.sheet.ownerUnknown'),
      ownerUnset: t('overview.sheet.ownerUnset'),
      self: t('arrangements.self'),
      contact: t('arrangements.contactReference'),
      originalCount: (count) => t('overview.sheet.originalCount', { count }),
      unknownDate: t('overview.sheet.unknownDate'),
      onRoute: t('overview.sheet.onRoute'),
      gap: t('overview.sheet.gap'),
    },
    sleepPlan: {
      title: t('overview.sleepPlan.title'),
      stopCount: (count) => t('overview.sleepPlan.stopCount', { count }),
      covered: t('overview.sleepPlan.covered'),
      open: t('overview.sleepPlan.open'),
      openNights: (count) => t('overview.sleepPlan.openNights', { count }),
      overlap: t('overview.sleepPlan.overlap'),
      unknown: t('overview.sleepPlan.unknown'),
      datesUndecided: t('overview.sleepPlan.datesUndecided'),
      noVisits: t('overview.sleepPlan.noVisits'),
      noIssues: t('overview.sleepPlan.noIssues'),
      attention: t('overview.sleepPlan.attention'),
      reviewGap: (label) => t('overview.sleepPlan.reviewGap', { label }),
      unverified: (count) => t('overview.sleepPlan.unverified', { count }),
    },
    source: (kind, id) => t('overview.source', { kind: t(`overview.kinds.${kind}`), id }),
    kind: (kind) => t(`overview.kinds.${kind}`),
    status: (value) =>
      value === 'calendar' ? t('calendar') : t(`overview.status.${value}`, { defaultValue: value }),
  };
}
