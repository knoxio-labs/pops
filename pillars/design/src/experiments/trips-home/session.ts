import { useState } from 'react';

import { useRouteState } from '../trip-route-editing/canvas-state';
import { initialSettings } from '../trip-settings/fixture';
import { settingsFindings } from '../trip-settings/model';
import { createTripsHomeState } from './fixture';
import { addHomeTrip, homeSettingsState } from './model';

import type { TripSettings } from '../trip-settings/model';
import type { HomeBucket, HomeScenario } from './model';

function newDraft(): TripSettings {
  return { ...initialSettings('empty').trip, id: crypto.randomUUID() };
}

/** Keeps source history separate from filters, local navigation and a resumable creation draft. */
export function useTripsHome(scenario: HomeScenario) {
  const history = useRouteState(() => createTripsHomeState(scenario));
  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState<'all' | HomeBucket>('all');
  const [selectedId, select] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, update] = useState(newDraft);
  const [error, setError] = useState<string | null>(null);
  const selected = history.state.trips.find((trip) => trip.settings.id === selectedId);
  const create = () => {
    const findings = settingsFindings(homeSettingsState(history.state, draft));
    if (findings.length) {
      setError(findings.map((finding) => finding.message).join(' '));
      return;
    }
    const next = addHomeTrip(history.state, draft, `${history.state.referenceDate}T12:00:00Z`);
    if (next === history.state) {
      setError('Choose a distinct trip identifier.');
      return;
    }
    history.change(next);
    update(newDraft());
    setError(null);
    setOpen(false);
  };
  const cancel = () => {
    update(newDraft());
    setError(null);
    setOpen(false);
  };
  return {
    history,
    query,
    setQuery,
    bucket,
    setBucket,
    select,
    open,
    setOpen,
    draft,
    update,
    error,
    selected,
    create,
    cancel,
  };
}
