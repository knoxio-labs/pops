import type { LabelContent, PrintSubject } from '@pops/inventory/labels';

import type { LabelFragility } from './label-fragility';

/** Loading and failure state of one label preparation dependency. */
export interface LabelReadState {
  pending: boolean;
  error: Error | null;
}

/** Independent reads used by selected label content or the selection rail. */
export interface LabelReads {
  items: LabelReadState;
  catalogue: LabelReadState;
  contents: ReadonlyMap<string, LabelReadState>;
  descendants: ReadonlyMap<string, LabelReadState>;
}

/** Normalizes query failures without losing their original Error objects. */
export function labelReadState(pending: boolean, error: unknown): LabelReadState {
  if (error == null) return { pending, error: null };
  return { pending, error: error instanceof Error ? error : new Error(String(error)) };
}

/** Combines only the dependencies supplied by the caller. */
export function combineLabelReads(reads: Iterable<LabelReadState>): LabelReadState {
  const combined: LabelReadState = { pending: false, error: null };
  for (const read of reads) {
    combined.pending ||= read.pending;
    combined.error ??= read.error;
  }
  return combined;
}

/** Available data states used to derive the current job's required reads. */
export interface LabelReadInputs {
  reads?: LabelReads;
  fragility?: ReadonlyMap<string, LabelFragility>;
  fieldErrors?: ReadonlyMap<string, ReadonlyMap<string, Error>>;
}

function handlingReads(
  id: string,
  fields: readonly string[],
  input: LabelReadInputs
): LabelReadState[] {
  const handling = input.fragility?.get(id);
  if (!fields.some((field) => handling?.fields.has(field))) return [];
  const required: LabelReadState[] = [];
  const descendants = input.reads?.descendants.get(id);
  if (descendants) required.push(descendants);
  if (handling?.error) required.push({ pending: false, error: handling.error });
  return required;
}

function subjectReads(
  content: Extract<LabelContent, { kind: 'parts' }>,
  id: string,
  input: LabelReadInputs
): LabelReadState[] {
  const required = handlingReads(id, content.fields, input);
  const contents = input.reads?.contents.get(id);
  if (content.parts.includes('contents') && contents) required.push(contents);
  const errors = input.fieldErrors?.get(id);
  for (const field of content.fields) {
    const error = errors?.get(field);
    if (error) required.push({ pending: false, error });
  }
  return required;
}

/** Selects print dependencies without making optional rail data fatal to the job. */
export function requiredLabelReads(
  content: LabelContent,
  subjects: readonly PrintSubject[],
  input: LabelReadInputs
): LabelReadState {
  const required: LabelReadState[] = input.reads ? [input.reads.items] : [];
  if (content.kind === 'auto') return combineLabelReads(required);
  if (content.fields.length > 0 && input.reads) required.push(input.reads.catalogue);
  return combineLabelReads([
    ...required,
    ...subjects.flatMap((subject) => subjectReads(content, subject.id, input)),
  ]);
}
