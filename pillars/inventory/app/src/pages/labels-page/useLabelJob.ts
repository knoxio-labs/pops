/**
 * The label job's state over the items the page loaded: content, sheet,
 * copies, where the first sheet starts, and the print round trip. The
 * items themselves live in the page's address and on the server; this hook
 * only arranges them onto sheets.
 */
import { useState } from 'react';

import {
  DEFAULT_LABEL_CONTENT,
  clampStartAt,
  CUSTOM_SHEET_ID,
  customLayout,
  DEFAULT_COPIES,
  DEFAULT_SHEET_ID,
  expandCopies,
  fieldChoices,
  findPreset,
  fitToSheet,
  nextStartAt,
  NO_DETAILS,
  planSheets,
  resolveLabel,
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

import type {
  CopiesByKind,
  LabelContent,
  LabelDetails,
  LabelFieldChoice,
  PrintSubject,
  ResolvedLabel,
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

/** One label of the job: what it is for and the content it prints with. */
export interface PrintLabelEntry {
  subject: PrintSubject;
  label: ResolvedLabel;
}

/** The job's starting choices, from the page's address and inventory settings. */
export interface LabelJobSeed {
  content?: LabelContent;
  details?: ReadonlyMap<string, LabelDetails>;
  /** A preset's size code or `custom`; null opens on the sheet this browser last used. */
  sheetId: string | null;
}

/** The job as the page renders it, with the actions that change it. */
export interface PrintJob {
  subjects: PrintSubject[];
  content: LabelContent;
  /** Every field the selected items have, for the label-content picker. */
  fields: LabelFieldChoice[];
  layout: SheetLayout;
  customSheet: SheetGeometry | null;
  /** Labels trimmed to fit and labels that fell back to a name or code. */
  adjustments: { trimmed: number; fallback: number };
  copies: CopiesByKind;
  startAt: number;
  labels: PrintLabelEntry[];
  pages: SheetPage[];
  uncoded: PrintSubject[];
  block: PrintBlock;
  outcome: PrintOutcome;
  /** Where the next job starts if this one printed. */
  nextStart: number;
  setContent: (content: LabelContent) => void;
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

function previewLabel(
  subject: PrintSubject,
  content: LabelContent,
  details: LabelDetails
): ResolvedLabel {
  const label = resolveLabel(content, subject, details);
  if (subject.code !== null || label.parts.includes('code')) return label;
  return { ...label, parts: [...label.parts, 'code'] };
}

interface LabelPlanInput {
  subjects: readonly PrintSubject[];
  copies: CopiesByKind;
  content: LabelContent;
  details: ReadonlyMap<string, LabelDetails>;
  layout: SheetLayout;
}

function planLabels({ subjects, copies, content, details, layout }: LabelPlanInput): {
  entries: PrintLabelEntry[];
  adjustments: { trimmed: number; fallback: number };
  tooSmall: boolean;
} {
  let trimmed = 0;
  let fallback = 0;
  let tooSmall = false;
  const entries: PrintLabelEntry[] = [];
  for (const subject of expandCopies(subjects, (entry) => copies[entry.kind])) {
    const wanted = previewLabel(subject, content, details.get(subject.id) ?? NO_DETAILS);
    const label = fitToSheet(wanted, layout);
    if (label === null) {
      tooSmall = true;
      continue;
    }
    if (label.parts.length < wanted.parts.length || label.fields.length < wanted.fields.length) {
      trimmed += 1;
    }
    if (label.fallback) fallback += 1;
    entries.push({ subject, label });
  }
  return { entries, adjustments: { trimmed, fallback }, tooSmall };
}

/** The label page's job over `subjects`. */
export function useLabelJob(subjects: PrintSubject[], seed: LabelJobSeed): PrintJob {
  const sheet = useSheet(seed);
  const { layout } = sheet;
  const [content, setContent] = useState<LabelContent>(seed.content ?? DEFAULT_LABEL_CONTENT);
  const [copies, setCopiesState] = useState<CopiesByKind>(DEFAULT_COPIES);
  const [outcome, setOutcome] = useState<PrintOutcome>('none');
  const startAt = clampStartAt(sheet.requestedStart, layout);
  const plan = planLabels({
    subjects,
    copies,
    content,
    details: seed.details ?? new Map(),
    layout,
  });
  const labels = plan.entries;
  const uncoded = subjects.filter((subject) => subject.code === null);
  const nextStart = nextStartAt(labels.length, startAt, layout);
  const block = printBlock(labels.length, uncoded.length, plan.tooSmall);

  return {
    subjects,
    content,
    fields: fieldChoices(subjects.map((subject) => seed.details?.get(subject.id) ?? NO_DETAILS)),
    layout,
    customSheet: sheet.customSheet,
    setSheet: sheet.setSheet,
    saveCustomSheet: sheet.saveCustomSheet,
    adjustments: plan.adjustments,
    copies,
    startAt,
    labels,
    pages: planSheets(labels.length, startAt, layout),
    uncoded,
    block,
    outcome,
    nextStart,
    setContent,
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
