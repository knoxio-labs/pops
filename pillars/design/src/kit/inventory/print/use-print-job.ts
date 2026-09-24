import { useState } from 'react';

import { clampStartAt, sheetLayout } from './sheet-layouts';
import { expandCopies, nextStartAt, planSheets } from './sheet-plan';

import type { LabelTemplateId, PrintSubject } from './print-subject';
import type { SheetLayout, SheetLayoutId } from './sheet-layouts';
import type { SheetPage } from './sheet-plan';

/**
 * What happened after the browser's print dialog closed. Browsers do not
 * say whether it printed, so the page asks before moving the start.
 */
export type PrintOutcome = 'none' | 'asking' | 'printed' | 'cancelled';

/** What the page opens on: the selection it was entered with and the job's starting choices. */
export interface PrintJobSeed {
  subjects: PrintSubject[];
  template: LabelTemplateId;
  layoutId: SheetLayoutId;
  copies?: number;
  startAt?: number;
  outcome?: PrintOutcome;
}

/** The job as the page renders it, with the actions that change it. */
export interface PrintJob {
  subjects: PrintSubject[];
  template: LabelTemplateId;
  layout: SheetLayout;
  copies: number;
  startAt: number;
  labels: PrintSubject[];
  pages: SheetPage[];
  outcome: PrintOutcome;
  /** Where the next job starts if this one printed. */
  nextStart: number;
  setTemplate: (template: LabelTemplateId) => void;
  setLayout: (id: SheetLayoutId) => void;
  setCopies: (copies: number) => void;
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

/** The label page's whole state: the selection, the sheet, and the print round trip. */
export function usePrintJob(seed: PrintJobSeed): PrintJob {
  const selection = useSubjects(seed.subjects);
  const [template, setTemplate] = useState(seed.template);
  const [layoutId, setLayoutId] = useState(seed.layoutId);
  const [copies, setCopies] = useState(seed.copies ?? 1);
  const layout = sheetLayout(layoutId);
  const [requestedStart, setStartAt] = useState(seed.startAt ?? 1);
  const [outcome, setOutcome] = useState<PrintOutcome>(seed.outcome ?? 'none');
  const startAt = clampStartAt(requestedStart, layout);
  const labels = expandCopies(selection.subjects, copies);
  const nextStart = nextStartAt(labels.length, startAt, layout);

  return {
    ...selection,
    template,
    layout,
    copies,
    startAt,
    labels,
    pages: planSheets(labels.length, startAt, layout),
    outcome,
    nextStart,
    setTemplate,
    setLayout: setLayoutId,
    setCopies,
    setStartAt: (value) => setStartAt(clampStartAt(value, layout)),
    print: () => {
      window.print();
      setOutcome('asking');
    },
    answer: (printed) => {
      if (printed) setStartAt(nextStart);
      setOutcome(printed ? 'printed' : 'cancelled');
    },
  };
}
