import {
  autoParts,
  expandCopies,
  fitToSheet,
  NO_DETAILS,
  resolveLabel,
} from '@pops/inventory/labels';

import type {
  CopiesByKind,
  LabelContent,
  LabelDetails,
  PrintSubject,
  ResolvedLabel,
  SheetLayout,
} from '@pops/inventory/labels';

import type { PrintLabelEntry } from './useLabelJob';

function wantsCode(content: LabelContent, kind: PrintSubject['kind']): boolean {
  const parts = content.kind === 'auto' ? autoParts(kind) : content.parts;
  return parts.includes('code');
}

/** Keeps a chosen code on an uncoded item's label so the preview shows it is missing. */
function previewLabel(
  subject: PrintSubject,
  content: LabelContent,
  details: LabelDetails
): ResolvedLabel {
  const label = resolveLabel(content, subject, details);
  if (subject.code !== null || label.parts.includes('code') || !wantsCode(content, subject.kind)) {
    return label;
  }
  return { ...label, parts: [...label.parts, 'code'] };
}

/** What {@link planLabels} arranges: the items, their copies and the job's choices. */
export interface LabelPlanInput {
  subjects: readonly PrintSubject[];
  copies: CopiesByKind;
  content: LabelContent;
  details: ReadonlyMap<string, LabelDetails>;
  layout: SheetLayout;
}

/** Every label of the job, fitted to the sheet, with the counts the page reports. */
export function planLabels({ subjects, copies, content, details, layout }: LabelPlanInput): {
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
