import { useState } from 'react';

import {
  CUSTOM_SHEET_ID,
  customLayout,
  DEFAULT_SHEET_ID,
  findPreset,
  sheetLayout,
} from '@pops/inventory/labels';

import {
  loadCustomSheet,
  loadSheetId,
  loadStartAt,
  storeCustomSheet,
  storeSheetId,
  storeStartAt,
} from './label-storage';

import type { SheetGeometry, SheetLayout } from '@pops/inventory/labels';

function resolveLayout(sheetId: string, customSheet: SheetGeometry | null): SheetLayout {
  if (sheetId === CUSTOM_SHEET_ID && customSheet) return customLayout(customSheet);
  return findPreset(sheetId) ?? sheetLayout(DEFAULT_SHEET_ID);
}

/** Restores the browser sheet and start position, including saved custom geometry. */
export function useLabelSheet(initialSheetId: string | null) {
  const [customSheet, setCustomSheet] = useState<SheetGeometry | null>(loadCustomSheet);
  const [sheetId, setSheetId] = useState(() => initialSheetId ?? loadSheetId() ?? DEFAULT_SHEET_ID);
  const layout = resolveLayout(sheetId, customSheet);
  const [requestedStart, setRequestedStart] = useState(() => loadStartAt(layout.id));
  const choose = (id: string) => {
    storeSheetId(id);
    setSheetId(id);
    setRequestedStart(loadStartAt(id));
  };
  return {
    layout,
    customSheet,
    requestedStart,
    setRequestedStart,
    setSheet: choose,
    saveCustomSheet: (geometry: SheetGeometry) => {
      storeCustomSheet(geometry);
      storeStartAt(CUSTOM_SHEET_ID, 1);
      setCustomSheet(geometry);
      choose(CUSTOM_SHEET_ID);
    },
  };
}
