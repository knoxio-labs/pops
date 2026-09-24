/**
 * Pagination for a print job: which label lands in which slot of which sheet,
 * given where the first sheet's free labels begin.
 */
import { labelsPerSheet } from './sheet-layouts';

import type { SheetLayout } from './sheet-layouts';

/** One label position on one sheet. */
export type SheetSlot =
  | { kind: 'used'; slot: number }
  | { kind: 'label'; slot: number; label: number }
  | { kind: 'blank'; slot: number };

export interface SheetPage {
  /** 0-based page number. */
  page: number;
  slots: SheetSlot[];
}

function assertPlan(labelCount: number, startAt: number, layout: SheetLayout): void {
  if (!Number.isInteger(labelCount) || labelCount < 0) {
    throw new RangeError(`label count must be a whole number, got ${labelCount}`);
  }
  const perSheet = labelsPerSheet(layout);
  if (!Number.isInteger(startAt) || startAt < 1 || startAt > perSheet) {
    throw new RangeError(`start must be a label from 1 to ${perSheet}, got ${startAt}`);
  }
}

/**
 * Sheets a job needs. `startAt` is the 1-based label the first sheet starts
 * on, so `startAt - 1` labels of that sheet are already peeled off. A job
 * with nothing in it needs no sheets.
 */
export function pageCount(labelCount: number, startAt: number, layout: SheetLayout): number {
  assertPlan(labelCount, startAt, layout);
  if (labelCount === 0) return 0;
  return Math.ceil((startAt - 1 + labelCount) / labelsPerSheet(layout));
}

/**
 * Every sheet of a job, slot by slot: the used labels at the head of the
 * first sheet, the job's labels in order, and the blank labels left on the
 * last sheet.
 */
export function planSheets(labelCount: number, startAt: number, layout: SheetLayout): SheetPage[] {
  const pages = pageCount(labelCount, startAt, layout);
  const perSheet = labelsPerSheet(layout);
  const skipped = startAt - 1;
  return Array.from({ length: pages }, (_, page) => ({
    page,
    slots: Array.from({ length: perSheet }, (_, slot): SheetSlot => {
      const position = page * perSheet + slot;
      if (position < skipped) return { kind: 'used', slot };
      const label = position - skipped;
      return label < labelCount ? { kind: 'label', slot, label } : { kind: 'blank', slot };
    }),
  }));
}

/**
 * The label the next job should start on if this one printed: the slot after
 * its last label, or 1 when it finished a sheet exactly.
 */
export function nextStartAt(labelCount: number, startAt: number, layout: SheetLayout): number {
  assertPlan(labelCount, startAt, layout);
  return ((startAt - 1 + labelCount) % labelsPerSheet(layout)) + 1;
}

/**
 * The job's labels in print order: each subject repeated `copies` times,
 * copies side by side so a box's pair peels off together.
 */
export function expandCopies<T>(subjects: readonly T[], copies: number): T[] {
  if (!Number.isInteger(copies) || copies < 1) {
    throw new RangeError(`copies must be a whole number from 1, got ${copies}`);
  }
  return subjects.flatMap((subject) => Array.from({ length: copies }, () => subject));
}
