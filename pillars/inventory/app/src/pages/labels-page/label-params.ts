/**
 * The label page's address: `/inventory/labels?ids=…&shows=…&sheet=…`,
 * plus `contents=1` to print each listed box together with what is in it.
 * The legacy `template` parameter remains readable for old links. The ids are
 * the job; everything else is a starting choice.
 */
import { DEFAULT_LABEL_CONTENT, presetById } from '@pops/inventory/labels';

import type { LabelContent, LabelPresetId, LabelTemplateChoice } from '@pops/inventory/labels';

/** The most items one label job holds, the `GET /web/items` `ids` limit. */
export const MAX_LABEL_IDS = 200;

/** The label page's search parameters, parsed. */
export interface LabelParams {
  ids: string[];
  /** The selected named content preset, or null for an unknown explicit value. */
  shows: LabelPresetId | null;
  content: LabelContent;
  sheetId: string | null;
  contents: boolean;
}

/** Stored defaults used when the URL does not explicitly choose content or a sheet. */
export interface LabelPageDefaults {
  shows: LabelPresetId;
  content: LabelContent;
  sheetId: string | null;
}

/** Defaults used by standalone links before the inventory settings query resolves. */
export const DEFAULT_LABEL_PAGE_DEFAULTS: LabelPageDefaults = {
  shows: 'auto',
  content: DEFAULT_LABEL_CONTENT,
  sheetId: null,
};

function isTemplateChoice(value: string | null): value is LabelTemplateChoice {
  return value === 'auto' || value === 'container' || value === 'item';
}

function showsForTemplate(template: LabelTemplateChoice): LabelPresetId {
  if (template === 'container') return 'qr-name-code';
  if (template === 'item') return 'qr-code';
  return 'auto';
}

function explicitShows(search: URLSearchParams): LabelPresetId | null | undefined {
  if (search.has('shows')) return presetById(search.get('shows'))?.id ?? null;
  if (!search.has('template')) return undefined;
  const template = search.get('template');
  return template !== null && isTemplateChoice(template) ? showsForTemplate(template) : null;
}

function contentForShows(shows: LabelPresetId | null): LabelContent {
  return shows === null
    ? DEFAULT_LABEL_CONTENT
    : (presetById(shows)?.content ?? DEFAULT_LABEL_CONTENT);
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
  const requestedShows = explicitShows(search);
  const shows = requestedShows === undefined ? defaults.shows : requestedShows;
  return {
    ids: parseIds(search.get('ids')),
    shows,
    content: requestedShows === undefined ? defaults.content : contentForShows(shows),
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
