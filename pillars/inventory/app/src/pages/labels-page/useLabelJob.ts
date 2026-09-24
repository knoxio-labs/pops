/**
 * The label job's state over the items the page loaded: template, sheet,
 * copies, where the first sheet starts, and the print round trip. The
 * items themselves live in the page's address and on the server; this hook
 * only arranges them onto sheets.
 */
import { useState } from 'react';

import {
  clampStartAt,
  CUSTOM_SHEET_ID,
  customLayout,
  DEFAULT_COPIES,
  DEFAULT_SHEET_ID,
  expandCopies,
  findPreset,
  nextStartAt,
  planSheets,
  resolveTemplate,
  sheetLayout,
  templateFits,
} from '@pops/inventory/labels';

import {
  loadCustomSheet,
  loadSheetId,
  loadStartAt,
  storeCustomSheet,
  storeSheetId,
  storeStartAt,
} from './label-storage';

import type {
  CopiesByKind,
  LabelTemplateChoice,
  LabelTemplateId,
  PrintSubject,
  SheetGeometry,
  SheetLayout,
  SheetPage,
} from '@pops/inventory/labels';

/**
 * What happened after the browser's print dialog closed. Browsers do not
 * say whether it printed, so the page asks before moving the start.
 */
export type PrintOutcome = 'none' | 'asking' | 'printed' | 'cancelled';

/** Why Print is off: nothing to print, an item still without a code, or labels too small for a QR. */
export type PrintBlock = 'empty' | 'uncoded' | 'too-small' | null;

/** One label of the job: what it is for and the template it prints with. */
export interface PrintLabelEntry {
  subject: PrintSubject;
  template: LabelTemplateId;
}

/** The job's starting choices, from the page's address. */
export interface LabelJobSeed {
  template: LabelTemplateChoice;
  /** A preset's size code or `custom`; null opens on the sheet this browser last used. */
  sheetId: string | null;
}

/** The job as the page renders it, with the actions that change it. */
export interface PrintJob {
  subjects: PrintSubject[];
  template: LabelTemplateChoice;
  layout: SheetLayout;
  customSheet: SheetGeometry | null;
  fits: Record<LabelTemplateId, boolean>;
  copies: CopiesByKind;
  startAt: number;
  labels: PrintLabelEntry[];
  pages: SheetPage[];
  uncoded: PrintSubject[];
  block: PrintBlock;
  outcome: PrintOutcome;
  /** Where the next job starts if this one printed. */
  nextStart: number;
  setTemplate: (template: LabelTemplateChoice) => void;
  setSheet: (id: string) => void;
  saveCustomSheet: (geometry: SheetGeometry) => void;
  setCopies: (kind: PrintSubject['kind'], copies: number) => void;
  setStartAt: (startAt: number) => void;
  print: () => void;
  answer: (printed: boolean) => void;
}

function resolveLayout(sheetId: string, customSheet: SheetGeometry | null): SheetLayout {
  if (sheetId === CUSTOM_SHEET_ID && customSheet) return customLayout(customSheet);
  return findPreset(sheetId) ?? sheetLayout(DEFAULT_SHEET_ID);
}

function useSheet(seed: LabelJobSeed) {
  const [customSheet, setCustomSheet] = useState<SheetGeometry | null>(loadCustomSheet);
  const [sheetId, setSheetId] = useState(() => seed.sheetId ?? loadSheetId() ?? DEFAULT_SHEET_ID);
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

function printBlock(labels: number, uncoded: number, tooSmall: boolean): PrintBlock {
  if (tooSmall) return 'too-small';
  if (labels === 0) return 'empty';
  return uncoded > 0 ? 'uncoded' : null;
}

function jobLabels(
  subjects: readonly PrintSubject[],
  copies: CopiesByKind,
  template: LabelTemplateChoice,
  layout: SheetLayout
): PrintLabelEntry[] {
  return expandCopies(subjects, (subject) => copies[subject.kind]).flatMap(
    (subject): PrintLabelEntry[] => {
      const resolved = resolveTemplate(subject, template, layout);
      return resolved ? [{ subject, template: resolved }] : [];
    }
  );
}

/** The label page's job over `subjects`. */
export function useLabelJob(subjects: PrintSubject[], seed: LabelJobSeed): PrintJob {
  const sheet = useSheet(seed);
  const { layout } = sheet;
  const [requestedTemplate, setTemplate] = useState<LabelTemplateChoice>(seed.template);
  const [copies, setCopiesState] = useState<CopiesByKind>(DEFAULT_COPIES);
  const [outcome, setOutcome] = useState<PrintOutcome>('none');
  const fits = { container: templateFits(layout, 'container'), item: templateFits(layout, 'item') };
  const template =
    requestedTemplate !== 'auto' && !fits[requestedTemplate] ? 'auto' : requestedTemplate;
  const startAt = clampStartAt(sheet.requestedStart, layout);
  const labels = jobLabels(subjects, copies, template, layout);
  const uncoded = subjects.filter((subject) => subject.code === null);
  const nextStart = nextStartAt(labels.length, startAt, layout);
  const block = printBlock(labels.length, uncoded.length, !fits.item);

  return {
    subjects,
    layout,
    customSheet: sheet.customSheet,
    setSheet: sheet.setSheet,
    saveCustomSheet: sheet.saveCustomSheet,
    template,
    fits,
    copies,
    startAt,
    labels,
    pages: planSheets(labels.length, startAt, layout),
    uncoded,
    block,
    outcome,
    nextStart,
    setTemplate,
    setCopies: (kind, value) => setCopiesState((current) => ({ ...current, [kind]: value })),
    setStartAt: (value) => sheet.setRequestedStart(clampStartAt(value, layout)),
    print: () => {
      if (block) return;
      window.print();
      setOutcome('asking');
    },
    answer: (printed) => {
      if (printed) {
        storeStartAt(layout.id, nextStart);
        sheet.setRequestedStart(nextStart);
      }
      setOutcome(printed ? 'printed' : 'cancelled');
    },
  };
}
