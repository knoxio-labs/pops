import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { typeFilterOptions } from '../../foundation/list-page/list-filters.js';
import { useShortcutScope } from '../../foundation/shortcuts/shortcut-provider.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { BulkEntryPageView } from './bulk-entry-page-view.js';
import { useBulkEntryPageActions, useBulkEntryPresets } from './use-bulk-entry-page.js';
import { useBulkEntry } from './use-bulk-entry.js';

import type { ReactElement } from 'react';

/** Renders the spreadsheet-like inventory bulk-entry workflow. */
export function BulkEntryPage(): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnline();
  const catalogue = useCatalogueLookups();
  const placementSubject = useMemo(() => ({ kind: 'items' as const, ids: [] as const }), []);
  const placement = usePlacementSources(placementSubject);
  const typeOptions = useMemo(() => typeFilterOptions(catalogue.types), [catalogue.types]);
  const entry = useBulkEntry(
    { destination: { kind: 'in-hand' }, defaultTypeKey: null },
    typeOptions
  );
  const canCreate =
    online &&
    entry.phase !== 'submitting' &&
    entry.phase !== 'validating' &&
    entry.counts.ready > 0;
  useShortcutScope('form', {
    'form-save': (event) => {
      if (!canCreate) return false;
      event.preventDefault();
      void entry.create();
      return true;
    },
  });
  const presets = useBulkEntryPresets(
    location.search,
    entry,
    { placement, catalogue },
    typeOptions
  );
  const actions = useBulkEntryPageActions(entry, navigate);
  return (
    <BulkEntryPageView
      entry={entry}
      online={online}
      world={placement.world}
      recents={placement.recents}
      types={typeOptions}
      onDestination={presets.onDestination}
      onDefaultTypeKey={presets.onDefaultTypeKey}
      onCreate={() => void entry.create()}
      onUndo={actions.onUndo}
      onShowInItems={actions.onShowInItems}
      onPrintLabels={actions.onPrintLabels}
    />
  );
}
