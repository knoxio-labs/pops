/**
 * The label page's address: `/inventory/labels?ids=…&template=…&sheet=…`,
 * plus `contents=1` to print each listed box together with what is in it.
 * The ids are the job; everything else is a starting choice.
 */
import { DEFAULT_LABEL_CONTENT } from '@pops/inventory/labels';

import type { LabelContent, LabelTemplateChoice } from '@pops/inventory/labels';

/** The most items one label job holds, the `GET /web/items` `ids` limit. */
export const MAX_LABEL_IDS = 200;

/** The label page's search parameters, parsed. */
export interface LabelParams {
  ids: string[];
  template: LabelTemplateChoice;
  content: LabelContent;
  sheetId: string | null;
  contents: boolean;
}

/** Stored defaults used when the URL does not explicitly choose a template or sheet. */
export interface LabelPageDefaults {
  template: LabelTemplateChoice;
  content: LabelContent;
  sheetId: string | null;
}

/** Defaults used by standalone links before the inventory settings query resolves. */
export const DEFAULT_LABEL_PAGE_DEFAULTS: LabelPageDefaults = {
  template: 'auto',
  content: DEFAULT_LABEL_CONTENT,
  sheetId: null,
};

function isTemplateChoice(value: string | null): value is LabelTemplateChoice {
  return value === 'auto' || value === 'container' || value === 'item';
}

function templateFromSearch(
  search: URLSearchParams,
  fallback: LabelTemplateChoice
): LabelTemplateChoice {
  const template = search.get('template');
  if (template === null) return fallback;
  return isTemplateChoice(template) ? template : 'auto';
}

function contentForTemplate(template: LabelTemplateChoice): LabelContent {
  if (template === 'container') {
    return { kind: 'parts', parts: ['qr', 'name', 'code'], fields: [] };
  }
  if (template === 'item') {
    return { kind: 'parts', parts: ['qr', 'code'], fields: [] };
  }
  return DEFAULT_LABEL_CONTENT;
}

/** The ids in `ids=`, trimmed, without blanks or repeats, capped at {@link MAX_LABEL_IDS}. */
export function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return [...new Set(ids)].slice(0, MAX_LABEL_IDS);
}

/** Reads the label page's parameters; explicit URL choices win over stored defaults. */
export function readLabelParams(
  search: URLSearchParams,
  defaults: LabelPageDefaults = DEFAULT_LABEL_PAGE_DEFAULTS
): LabelParams {
  const template = templateFromSearch(search, defaults.template);
  const hasTemplate = search.has('template');
  return {
    ids: parseIds(search.get('ids')),
    template,
    content: hasTemplate ? contentForTemplate(template) : defaults.content,
    sheetId: search.get('sheet') ?? defaults.sheetId,
    contents: search.get('contents') === '1',
  };
}

/** The link that opens the label page on these items. */
export function labelsHref(ids: readonly string[], options: { contents?: boolean } = {}): string {
  const search = new URLSearchParams({ ids: ids.slice(0, MAX_LABEL_IDS).join(',') });
  if (options.contents) search.set('contents', '1');
  return `/inventory/labels?${search.toString()}`;
}
