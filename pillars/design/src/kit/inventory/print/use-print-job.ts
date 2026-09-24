import { useState } from 'react';

import { loadCustomSheet, storeCustomSheet } from './custom-sheet-storage';
import { DEFAULT_COPIES, resolveTemplate } from './print-subject';
import { clampStartAt, CUSTOM_SHEET_ID, customLayout, templateFits } from './sheet-layouts';
import { expandCopies, nextStartAt, planSheets } from './sheet-plan';
import { DEFAULT_SHEET_ID, findPreset, sheetLayout } from './sheet-presets';

import type {
  CopiesByKind,
  LabelTemplateChoice,
  LabelTemplateId,
  PrintSubject,
} from './print-subject';
import type { SheetGeometry, SheetLayout } from './sheet-layouts';
import type { SheetPage } from './sheet-plan';

/**
 * What happened after the browser's print dialog closed. Browsers do not
 * say whether it printed, so the page asks before moving the start.
 */
export type PrintOutcome = 'none' | 'asking' | 'printed' | 'cancelled';

/** Why Print is off: nothing to print, an item still without a code, or labels too small for a QR. */
export type PrintBlock = 'empty' | 'uncoded' | 'too-small' | null;

/** What the page opens on: the selection it was entered with and the job's starting choices. */
export interface PrintJobSeed {
  subjects: PrintSubject[];
  template?: LabelTemplateChoice;
  /** A preset's size code, or `custom` for the sheet this browser remembers. */
  sheetId?: string;
  /** Stands in for the remembered custom sheet, for reviewing that state. */
  customSheet?: SheetGeometry | null;
  copies?: CopiesByKind;
  startAt?: number;
  outcome?: PrintOutcome;
}

/** One label of the job: what it is for and the template it prints with. */
export interface PrintLabelEntry {
  subject: PrintSubject;
  template: LabelTemplateId;
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

/** The label page's whole state: the selection, the sheet, and the print round trip. */
export function usePrintJob(seed: PrintJobSeed): PrintJob {
  const selection = useSubjects(seed.subjects);
  const sheet = useSheet(seed);
  const { layout } = sheet;
  const [requestedTemplate, setTemplate] = useState<LabelTemplateChoice>(seed.template ?? 'auto');
  const [copies, setCopiesState] = useState<CopiesByKind>(seed.copies ?? DEFAULT_COPIES);
  const [requestedStart, setStartAt] = useState(seed.startAt ?? 1);
  const [outcome, setOutcome] = useState<PrintOutcome>(seed.outcome ?? 'none');
  const fits = { container: templateFits(layout, 'container'), item: templateFits(layout, 'item') };
  const template =
    requestedTemplate !== 'auto' && !fits[requestedTemplate] ? 'auto' : requestedTemplate;
  const startAt = clampStartAt(requestedStart, layout);
  const labels = expandCopies(selection.subjects, (subject) => copies[subject.kind]).flatMap(
    (subject): PrintLabelEntry[] => {
      const resolved = resolveTemplate(subject, template, layout);
      return resolved ? [{ subject, template: resolved }] : [];
    }
  );
  const uncoded = selection.subjects.filter((subject) => subject.code === null);
  const nextStart = nextStartAt(labels.length, startAt, layout);
  const block = printBlock(labels.length, uncoded.length, !fits.item);

  return {
    ...selection,
    ...sheet,
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
