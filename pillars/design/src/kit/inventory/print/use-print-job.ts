import { useState } from 'react';

import {
  DEFAULT_COPIES,
  clampStartAt,
  CUSTOM_SHEET_ID,
  customLayout,
  expandCopies,
  nextStartAt,
  planSheets,
  DEFAULT_SHEET_ID,
  findPreset,
  sheetLayout,
} from '@pops/inventory/labels';

import { loadCustomSheet, storeCustomSheet } from './custom-sheet-storage';
import { DEFAULT_LABEL_CONTENT, fieldChoices, NO_DETAILS, resolveLabel } from './label-content';
import { fitToSheet } from './label-layout';

import type {
  CopiesByKind,
  PrintSubject,
  SheetGeometry,
  SheetLayout,
  SheetPage,
} from '@pops/inventory/labels';

import type { LabelContent, LabelDetails, LabelFieldChoice, ResolvedLabel } from './label-content';

/**
 * What happened after the browser's print dialog closed. Browsers do not
 * say whether it printed, so the page asks before moving the start.
 */
export type PrintOutcome = 'none' | 'asking' | 'printed' | 'cancelled';

/** Why Print is off: nothing to print, an item still without a code, or a QR the labels are too small for. */
export type PrintBlock = 'empty' | 'uncoded' | 'too-small' | null;

/** What the page opens on: the selection it was entered with and the job's starting choices. */
export interface PrintJobSeed {
  subjects: PrintSubject[];
  /** What each label shows; Auto when absent. */
  content?: LabelContent;
  /** Type, fields and contents by item id, for labels that show more than the QR, name and code. */
  details?: Readonly<Record<string, LabelDetails>>;
  /** A preset's size code, or `custom` for the sheet this browser remembers. */
  sheetId?: string;
  /** Stands in for the remembered custom sheet, for reviewing that state. */
  customSheet?: SheetGeometry | null;
  copies?: CopiesByKind;
  startAt?: number;
  outcome?: PrintOutcome;
}

/** One label of the job: what it is for and what it prints. */
export interface PrintLabelEntry {
  subject: PrintSubject;
  label: ResolvedLabel;
}

/** Labels the sheet or the items changed from what was chosen, for the notice under the options. */
export interface PrintAdjustments {
  /** Labels whose QR left no room for the rest, printed as QR and code instead. */
  trimmed: number;
  /** Labels that could show nothing chosen and print their code or name instead. */
  fallback: number;
}

/** The job as the page renders it, with the actions that change it. */
export interface PrintJob {
  subjects: PrintSubject[];
  content: LabelContent;
  /** Every field the job's items have, for the picker. */
  fields: LabelFieldChoice[];
  layout: SheetLayout;
  customSheet: SheetGeometry | null;
  adjustments: PrintAdjustments;
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
  add: (subjects: PrintSubject[]) => void;
  remove: (id: string) => void;
  setCode: (id: string, code: string) => void;
  print: () => void;
  answer: (printed: boolean) => void;
}

function useSubjects(seed: PrintSubject[]) {
  const [subjects, setSubjects] = useState(seed);
  return {
    subjects,
    add: (added: PrintSubject[]) =>
      setSubjects((current) => [
        ...current,
        ...added.filter((candidate) => !current.some((held) => held.id === candidate.id)),
      ]),
    remove: (id: string) => setSubjects((current) => current.filter((held) => held.id !== id)),
    setCode: (id: string, code: string) =>
      setSubjects((current) =>
        current.map((held) => (held.id === id ? { ...held, code, suggestedCode: null } : held))
      ),
  };
}

function useSheet(seed: PrintJobSeed) {
  const [customSheet, setCustomSheet] = useState<SheetGeometry | null>(() =>
    seed.customSheet === undefined ? loadCustomSheet() : seed.customSheet
  );
  const [sheetId, setSheetId] = useState(seed.sheetId ?? DEFAULT_SHEET_ID);
  const layout =
    sheetId === CUSTOM_SHEET_ID && customSheet
      ? customLayout(customSheet)
      : (findPreset(sheetId) ?? sheetLayout(DEFAULT_SHEET_ID));
  return {
    layout,
    customSheet,
    setSheet: setSheetId,
    saveCustomSheet: (geometry: SheetGeometry) => {
      storeCustomSheet(geometry);
      setCustomSheet(geometry);
      setSheetId(CUSTOM_SHEET_ID);
    },
  };
}

function printBlock(labels: number, uncoded: number, tooSmall: boolean): PrintBlock {
  if (tooSmall) return 'too-small';
  if (labels === 0) return 'empty';
  return uncoded > 0 ? 'uncoded' : null;
}

function showsCode(label: ResolvedLabel): boolean {
  return label.parts.includes('code');
}

function planLabels(
  subjects: PrintSubject[],
  content: LabelContent,
  details: (id: string) => LabelDetails,
  layout: SheetLayout
) {
  let trimmed = 0;
  let fallback = 0;
  let tooSmall = false;
  const entries: PrintLabelEntry[] = [];
  for (const subject of subjects) {
    const wanted = resolveLabel(content, subject, details(subject.id));
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

/** The label page's whole state: the selection, the sheet, and the print round trip. */
export function usePrintJob(seed: PrintJobSeed): PrintJob {
  const selection = useSubjects(seed.subjects);
  const sheet = useSheet(seed);
  const { layout } = sheet;
  const [content, setContent] = useState<LabelContent>(seed.content ?? DEFAULT_LABEL_CONTENT);
  const [copies, setCopiesState] = useState<CopiesByKind>(seed.copies ?? DEFAULT_COPIES);
  const [requestedStart, setStartAt] = useState(seed.startAt ?? 1);
  const [outcome, setOutcome] = useState<PrintOutcome>(seed.outcome ?? 'none');
  const details = (id: string) => seed.details?.[id] ?? NO_DETAILS;
  const startAt = clampStartAt(requestedStart, layout);
  const plan = planLabels(
    expandCopies(selection.subjects, (subject) => copies[subject.kind]),
    content,
    details,
    layout
  );
  const labels = plan.entries;
  const uncoded = selection.subjects.filter(
    (subject) =>
      subject.code === null &&
      labels.some((entry) => entry.subject.id === subject.id && showsCode(entry.label))
  );
  const nextStart = nextStartAt(labels.length, startAt, layout);
  const block = printBlock(labels.length, uncoded.length, plan.tooSmall);

  return {
    ...selection,
    ...sheet,
    content,
    fields: fieldChoices(selection.subjects.map((subject) => details(subject.id))),
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
    setStartAt: (value) => setStartAt(clampStartAt(value, layout)),
    print: () => {
      if (block) return;
      window.print();
      setOutcome('asking');
    },
    answer: (printed) => {
      if (printed) setStartAt(nextStart);
      setOutcome(printed ? 'printed' : 'cancelled');
    },
  };
}
