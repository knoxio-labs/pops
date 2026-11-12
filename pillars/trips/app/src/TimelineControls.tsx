import { useTranslation } from 'react-i18next';

import { CaptureTimelineFilters } from '@pops/trips-workspace';
import { Button } from '@pops/ui';

import { useOverviewLabels } from './timeline-labels';

import type { CaptureTimelineSelection, CaptureTimelineVisibility } from '@pops/trips-workspace';

import type { CaptureContextProps } from './CaptureContext';
import type { TimelineSelection } from './TimelineContext';

/** Timeline actions open existing inline contexts; Documents remains the separate list shortcut. */
export function TimelineControls({
  calendarEnabled,
  toggleCalendar,
  onSelect,
}: {
  calendarEnabled: boolean;
  toggleCalendar: () => void;
  onSelect: (selection: TimelineSelection) => void;
}) {
  const { t } = useTranslation('trips');
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      <Button className="min-h-11" onClick={() => onSelect({ kind: 'create', sourceKind: null })}>
        {t('timeline.create.title')}
      </Button>
      <Button
        variant="outline"
        className="min-h-11"
        aria-pressed={calendarEnabled}
        onClick={toggleCalendar}
      >
        {t('calendar')}
      </Button>
      <Button
        variant="outline"
        className="min-h-11"
        onClick={() => onSelect({ kind: 'placement', target: null })}
      >
        {t('timeline.route.title')}
      </Button>
      <Button variant="outline" className="min-h-11" onClick={() => onSelect({ kind: 'metadata' })}>
        {t('settings')}
      </Button>
    </div>
  );
}

/** Bind controlled source visibility and exact contextual opening to the selected Trip. */
export function TimelineFilters(
  props: Pick<CaptureContextProps, 'tripId' | 'client' | 'contacts'> & {
    selection: CaptureTimelineSelection;
    onChange: (selection: CaptureTimelineSelection) => void;
    onVisibility: (visibility: CaptureTimelineVisibility) => void;
    onSelect: (selection: TimelineSelection) => void;
  }
) {
  const { t } = useTranslation('trips');
  const labels = useOverviewLabels();
  return (
    <CaptureTimelineFilters
      {...props}
      onOpenSource={(source) => props.onSelect({ kind: 'source', source })}
      label={(key) => t(`timeline.filters.${key}`)}
      referenceLabel={labels.source}
    />
  );
}
