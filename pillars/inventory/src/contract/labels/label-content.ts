/**
 * What a label shows. The job picks it once for every label: a preset, or
 * any mix of the QR, the code, the name, a box's contents and fields from the
 * items' types. Auto is the one choice that differs by kind: boxes get the
 * QR, name and code, everything else the QR and code.
 *
 * A part an item cannot fill is left off its label (contents on a thing
 * that holds nothing, a field its type does not have or it leaves empty).
 * A label left with nothing prints its code, or its name when it has no
 * code, so no label comes out blank.
 */
import type { PrintSubject } from './label-subject.js';

/** One part a label can show. */
export type LabelPart = 'qr' | 'code' | 'name' | 'contents';

/** Parts in the order the popover lists them and a label stacks its text. */
export const LABEL_PARTS: readonly LabelPart[] = ['qr', 'name', 'code', 'contents'];

/** The job's choice: Auto, or a fixed set of parts and fields for every label. */
export type LabelContent =
  | { kind: 'auto' }
  | { kind: 'parts'; parts: readonly LabelPart[]; fields: readonly string[] };

/** One field value an item can print, keyed by `<type>.<field>`. */
export interface LabelFieldValue {
  id: string;
  label: string;
  value: string;
}

/** What the label page knows about an item beyond the print subject. */
export interface LabelDetails {
  typeName: string | null;
  fields: readonly LabelFieldValue[];
  /** Names of what a box holds, in the order the box lists them. */
  contents: readonly string[];
}

/** A field offered in the picker: the type it belongs to and its label. */
export interface LabelFieldChoice {
  id: string;
  label: string;
  typeName: string;
}

/** The ids of the presets, in the order the picker lists them. */
export type LabelPresetId =
  | 'auto'
  | 'qr-name-code'
  | 'qr-code'
  | 'qr'
  | 'code'
  | 'name'
  | 'contents';

/** A named shortcut to one content choice. */
export interface LabelPreset {
  id: LabelPresetId;
  label: string;
  hint: string;
  content: LabelContent;
}

function parts(...chosen: LabelPart[]): LabelContent {
  return { kind: 'parts', parts: chosen, fields: [] };
}

/** Every preset. Auto is first because a new job opens on it. */
export const LABEL_PRESETS: readonly LabelPreset[] = [
  {
    id: 'auto',
    label: 'Auto',
    hint: 'Boxes: QR, name and code. Items: QR and code.',
    content: { kind: 'auto' },
  },
  {
    id: 'qr-name-code',
    label: 'QR, name and code',
    hint: 'The box label, on everything.',
    content: parts('qr', 'name', 'code'),
  },
  {
    id: 'qr-code',
    label: 'QR and code',
    hint: 'The item label, on everything.',
    content: parts('qr', 'code'),
  },
  { id: 'qr', label: 'QR only', hint: 'The QR fills the label.', content: parts('qr') },
  { id: 'code', label: 'Code only', hint: 'The code, as large as fits.', content: parts('code') },
  { id: 'name', label: 'Name only', hint: 'The name, as large as fits.', content: parts('name') },
  {
    id: 'contents',
    label: 'Contents only',
    hint: 'What a box holds. Items get their code.',
    content: parts('contents'),
  },
];

/** The content a new job opens on. */
export const DEFAULT_LABEL_CONTENT: LabelContent = { kind: 'auto' };

/** The details of an item the page knows nothing more about. */
export const NO_DETAILS: LabelDetails = { typeName: null, fields: [], contents: [] };

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entry) => b.includes(entry));
}

/** The preset a content choice matches, or null for a custom mix. */
export function matchingPreset(content: LabelContent): LabelPreset | null {
  return (
    LABEL_PRESETS.find((preset) => {
      if (preset.content.kind !== content.kind) return false;
      if (preset.content.kind === 'auto' || content.kind === 'auto') return true;
      return content.fields.length === 0 && sameSet(preset.content.parts, content.parts);
    }) ?? null
  );
}

/** The preset with this id, or null for anything else (URL and settings values). */
export function presetById(id: string | null): LabelPreset | null {
  return id === null ? null : (LABEL_PRESETS.find((preset) => preset.id === id) ?? null);
}

const PART_NAMES: Readonly<Record<LabelPart, string>> = {
  qr: 'QR',
  code: 'code',
  name: 'name',
  contents: 'contents',
};

/** How the picker's button names the choice: the preset, or the parts it holds. */
export function describeContent(content: LabelContent): string {
  const preset = matchingPreset(content);
  if (preset) return preset.label;
  if (content.kind === 'auto') return 'Auto';
  const named = LABEL_PARTS.filter((part) => content.parts.includes(part)).map(
    (part) => PART_NAMES[part]
  );
  const fields = content.fields.length;
  if (fields > 0) named.push(fields === 1 ? '1 field' : `${fields} fields`);
  if (named.length === 0) return 'Nothing chosen';
  const [first = '', ...rest] = named;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(', ');
}

/** The parts Auto gives a subject of this kind. */
export function autoParts(kind: PrintSubject['kind']): readonly LabelPart[] {
  return kind === 'container' ? ['qr', 'name', 'code'] : ['qr', 'code'];
}

/** The parts shown as ticked in the picker. Auto ticks what every label gets
 * (QR and code); ticking anything from there starts a custom mix from it. */
export function tickedParts(content: LabelContent): readonly LabelPart[] {
  return content.kind === 'auto' ? autoParts('item') : content.parts;
}

/** Content with one part ticked or unticked. */
export function togglePart(content: LabelContent, part: LabelPart, on: boolean): LabelContent {
  const current = tickedParts(content);
  return {
    kind: 'parts',
    parts: LABEL_PARTS.filter((entry) => (entry === part ? on : current.includes(entry))),
    fields: content.kind === 'auto' ? [] : content.fields,
  };
}

/** Content with one field ticked or unticked. */
export function toggleField(content: LabelContent, fieldId: string, on: boolean): LabelContent {
  const fields = content.kind === 'auto' ? [] : content.fields;
  const rest = fields.filter((entry) => entry !== fieldId);
  return { kind: 'parts', parts: tickedParts(content), fields: on ? [...rest, fieldId] : rest };
}

/** What one label prints once the choice meets the item. */
export interface ResolvedLabel {
  parts: readonly LabelPart[];
  fields: readonly LabelFieldValue[];
  contents: readonly string[];
  /** True when nothing chosen applied and the label fell back to the code or name. */
  fallback: boolean;
}

/** The parts, fields and contents one item's label prints for this choice. */
export function resolveLabel(
  content: LabelContent,
  subject: Pick<PrintSubject, 'kind' | 'code'>,
  details: LabelDetails
): ResolvedLabel {
  if (content.kind === 'auto') {
    return { parts: autoParts(subject.kind), fields: [], contents: [], fallback: false };
  }
  const contents = subject.kind === 'container' ? details.contents : [];
  const kept = content.parts.filter((part) => part !== 'contents' || contents.length > 0);
  const fields = details.fields.filter(
    (field) => content.fields.includes(field.id) && field.value.trim() !== ''
  );
  if (kept.length > 0 || fields.length > 0) {
    return {
      parts: kept,
      fields,
      contents: kept.includes('contents') ? contents : [],
      fallback: false,
    };
  }
  return {
    parts: [subject.code === null ? 'name' : 'code'],
    fields: [],
    contents: [],
    fallback: true,
  };
}

/** Every field the job's items can print, grouped by type in first-seen order. */
export function fieldChoices(details: readonly LabelDetails[]): LabelFieldChoice[] {
  const seen = new Map<string, LabelFieldChoice>();
  for (const entry of details) {
    if (entry.typeName === null) continue;
    for (const field of entry.fields) {
      if (!seen.has(field.id)) {
        seen.set(field.id, { id: field.id, label: field.label, typeName: entry.typeName });
      }
    }
  }
  return [...seen.values()];
}
