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
  DEFAULT_COPIES,
  fieldChoices,
  nextStartAt,
  NO_DETAILS,
  planSheets,
} from '@pops/inventory/labels';

import { requiredLabelReads } from './label-read-state';
import { storeStartAt } from './label-storage';
import { planLabels } from './plan-labels';
import { useLabelSheet } from './use-label-sheet';

import type {
  CopiesByKind,
  LabelContent,
  LabelDetails,
  LabelFieldChoice,
  PrintSubject,
  SheetGeometry,
  SheetLayout,
  SheetPage,
} from '@pops/inventory/labels';

import type { LabelFragility } from './label-fragility';
import type { LabelReads } from './label-read-state';
import type { LabelPlanInput, PrintLabelEntry } from './plan-labels';

/**
 * What happened after the browser's print dialog closed. Browsers do not
 * say whether it printed, so the page asks before moving the start.
 */
export type PrintOutcome = 'none' | 'asking' | 'printed' | 'cancelled';

/** Maximum expanded labels a browser job may preview and print. */
export const MAX_JOB_LABELS = 1_000;

/** Why printing is blocked by the selection, label fit, job size or pending reads. */
export type PrintBlock =
  | 'empty'
  | 'uncoded'
  | 'too-small'
  | 'too-many'
  | 'loading'
  | 'read-error'
  | null;

/** The job's starting choices, from the page's address and inventory settings. */
export interface LabelJobSeed {
  content?: LabelContent;
  details?: ReadonlyMap<string, LabelDetails>;
  fragility?: ReadonlyMap<string, LabelFragility>;
  reads?: LabelReads;
  fields?: LabelFieldChoice[];
  fieldErrors?: ReadonlyMap<string, ReadonlyMap<string, Error>>;
  /** A preset's size code or `custom`; null opens on the sheet this browser last used. */
  sheetId: string | null;
}

/** The job as the page renders it, with the actions that change it. */
export interface PrintJob {
  subjects: PrintSubject[];
  /** Item ids manually marked fragile for this print job only. */
  fragileIds: ReadonlySet<string>;
  setFragile: (id: string, fragile: boolean) => void;
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
  /** Failure of data required by the current content choice, while controls stay editable. */
  readError: Error | null;
  /** True only when a marked label failed to fit the selected stock. */
  fragileTooSmall: boolean;
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

function planJob({ subjects, copies, ...options }: LabelPlanInput) {
  const tooMany =
    subjects.reduce((total, subject) => total + copies[subject.kind], 0) > MAX_JOB_LABELS;
  return {
    ...planLabels({ ...options, copies, subjects: tooMany ? [] : subjects }),
    tooMany,
  };
}

function printBlock(
  labels: number,
  uncoded: number,
  plan: ReturnType<typeof planJob>,
  read: { pending: boolean; error: Error | null }
): PrintBlock {
  if (read.error) return 'read-error';
  if (read.pending) return 'loading';
  if (plan.tooMany) return 'too-many';
  if (plan.tooSmall) return 'too-small';
  if (labels === 0) return 'empty';
  return uncoded > 0 ? 'uncoded' : null;
}

function uncodedSubjects(subjects: PrintSubject[], labels: PrintLabelEntry[]): PrintSubject[] {
  return subjects.filter(
    (subject) =>
      subject.code === null &&
      labels.some((entry) => entry.subject.id === subject.id && entry.label.parts.includes('code'))
  );
}

function useFragileLabels() {
  const [fragileIds, setFragileIds] = useState<ReadonlySet<string>>(new Set());
  return {
    fragileIds,
    setFragile: (id: string, fragile: boolean) =>
      setFragileIds((current) => {
        const next = new Set(current);
        if (fragile) next.add(id);
        else next.delete(id);
        return next;
      }),
  };
}

function jobFields(subjects: PrintSubject[], seed: LabelJobSeed): LabelFieldChoice[] {
  return (
    seed.fields ??
    fieldChoices(subjects.map((subject) => seed.details?.get(subject.id) ?? NO_DETAILS))
  );
}

/** The label page's job over `subjects`. */
export function useLabelJob(subjects: PrintSubject[], seed: LabelJobSeed): PrintJob {
  const fragile = useFragileLabels();
  const sheet = useLabelSheet(seed.sheetId);
  const { layout } = sheet;
  const [content, setContent] = useState<LabelContent>(seed.content ?? DEFAULT_LABEL_CONTENT);
  const [copies, setCopiesState] = useState<CopiesByKind>(DEFAULT_COPIES);
  const [outcome, setOutcome] = useState<PrintOutcome>('none');
  const startAt = clampStartAt(sheet.requestedStart, layout);
  const plan = planJob({
    subjects,
    fragileIds: fragile.fragileIds,
    fragility: seed.fragility,
    copies,
    content,
    details: seed.details ?? new Map(),
    layout,
  });
  const labels = plan.entries;
  const uncoded = uncodedSubjects(subjects, labels);
  const nextStart = nextStartAt(labels.length, startAt, layout);
  const read = requiredLabelReads(content, subjects, seed);
  const block = printBlock(labels.length, uncoded.length, plan, read);

  return {
    subjects,
    ...fragile,
    content,
    fields: jobFields(subjects, seed),
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
    readError: read.error,
    fragileTooSmall: plan.fragileTooSmall,
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
