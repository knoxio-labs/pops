import { autoParts, expandCopies, NO_DETAILS, resolveLabel } from '@pops/inventory/labels';

import { fitPrintedLabel } from './fragile-label-layout';

import type {
  CopiesByKind,
  LabelContent,
  LabelDetails,
  PrintSubject,
  ResolvedLabel,
  SheetLayout,
} from '@pops/inventory/labels';

import type { LabelFragility } from './label-fragility';

/** One label of the job: what it is for and the content it prints with. */
export interface PrintLabelEntry {
  subject: PrintSubject;
  label: ResolvedLabel;
  /** Whether this print job adds a fragile handling warning. */
  fragile?: boolean;
}

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

function resolvedForPrint(
  subject: PrintSubject,
  content: LabelContent,
  details: LabelDetails,
  { recorded, manual }: { recorded: LabelFragility | undefined; manual: boolean }
) {
  const fieldSelected =
    content.kind === 'parts' && content.fields.some((id) => recorded?.fields.has(id));
  const fragile = (fieldSelected && recorded?.fragile === true) || (!recorded?.recorded && manual);
  const printable =
    fragile && recorded
      ? { ...details, fields: details.fields.filter((field) => !recorded.fields.has(field.id)) }
      : details;
  return { wanted: previewLabel(subject, content, printable), fragile };
}

/** What {@link planLabels} arranges: the items, their copies and the job's choices. */
export interface LabelPlanInput {
  subjects: readonly PrintSubject[];
  copies: CopiesByKind;
  content: LabelContent;
  details: ReadonlyMap<string, LabelDetails>;
  layout: SheetLayout;
  fragileIds?: ReadonlySet<string>;
  fragility?: ReadonlyMap<string, LabelFragility>;
}

/** Every label of the job, fitted to the sheet, with the counts the page reports. */
export function planLabels({
  subjects,
  copies,
  content,
  details,
  layout,
  fragileIds,
  fragility,
}: LabelPlanInput): {
  entries: PrintLabelEntry[];
  adjustments: { trimmed: number; fallback: number };
  tooSmall: boolean;
  fragileTooSmall: boolean;
} {
  let trimmed = 0;
  let fallback = 0;
  let tooSmall = false;
  let fragileTooSmall = false;
  const entries: PrintLabelEntry[] = [];
  for (const subject of expandCopies(subjects, (entry) => copies[entry.kind])) {
    const { wanted, fragile } = resolvedForPrint(
      subject,
      content,
      details.get(subject.id) ?? NO_DETAILS,
      { recorded: fragility?.get(subject.id), manual: fragileIds?.has(subject.id) ?? false }
    );
    const label = fitPrintedLabel(wanted, layout, fragile);
    if (label === null) {
      tooSmall = true;
      fragileTooSmall ||= fragile;
      continue;
    }
    if (label.parts.length < wanted.parts.length || label.fields.length < wanted.fields.length) {
      trimmed += 1;
    }
    if (label.fallback) fallback += 1;
    entries.push({ subject, label, ...(fragile ? { fragile } : {}) });
  }
  return { entries, adjustments: { trimmed, fallback }, tooSmall, fragileTooSmall };
}
