import { useState } from 'react';

import type { Dispatch, SetStateAction } from 'react';

import type {
  CaptureTimelineSelection,
  CaptureTimelineVisibility,
  OverviewCalendarSelection,
} from '@pops/trips-workspace';

interface TimelinePresentationState {
  sourceFilter: CaptureTimelineSelection;
  setSourceFilter: Dispatch<SetStateAction<CaptureTimelineSelection>>;
  sourceVisibility: CaptureTimelineVisibility | undefined;
  setSourceVisibility: Dispatch<SetStateAction<CaptureTimelineVisibility | undefined>>;
  calendarEnabled: boolean;
  toggleCalendar: () => void;
  calendarSelection: OverviewCalendarSelection;
  setCalendarSelection: Dispatch<SetStateAction<OverviewCalendarSelection>>;
}

/** Keeps Calendar and Timeline filters local to the currently open Trip page. */
export function useTimelinePresentationState(initialCalendar?: boolean): TimelinePresentationState {
  const [sourceFilter, setSourceFilter] = useState<CaptureTimelineSelection>({
    kind: 'all',
    organisation: 'all',
    location: 'all',
  });
  const [sourceVisibility, setSourceVisibility] = useState<CaptureTimelineVisibility>();
  const [calendarEnabled, setCalendarEnabled] = useState(initialCalendar ?? false);
  const [calendarSelection, setCalendarSelection] = useState<OverviewCalendarSelection>({
    from: '',
    to: '',
    zone: '',
    kind: 'all',
    journey: '',
  });
  return {
    sourceFilter,
    setSourceFilter,
    sourceVisibility,
    setSourceVisibility,
    calendarEnabled,
    toggleCalendar: () => setCalendarEnabled((enabled) => !enabled),
    calendarSelection,
    setCalendarSelection,
  };
}
