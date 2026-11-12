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
    source: (kind, id) => t('overview.source', { kind: t(`overview.kinds.${kind}`), id }),
    status: (value) =>
      value === 'calendar' ? t('calendar') : t(`overview.status.${value}`, { defaultValue: value }),
  };
}
