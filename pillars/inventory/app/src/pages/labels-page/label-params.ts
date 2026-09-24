/**
 * The label page's address: `/inventory/labels?ids=…&template=…&sheet=…`,
 * plus `contents=1` to print each listed box together with what is in it.
 * The ids are the job; everything else is a starting choice.
 */
import type { LabelTemplateChoice } from '@pops/inventory/labels';

/** The most items one label job holds, the `GET /web/items` `ids` limit. */
export const MAX_LABEL_IDS = 200;

/** The label page's search parameters, parsed. */
export interface LabelParams {
  ids: string[];
  template: LabelTemplateChoice;
  sheetId: string | null;
  contents: boolean;
}

function isTemplateChoice(value: string | null): value is LabelTemplateChoice {
  return value === 'auto' || value === 'container' || value === 'item';
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

/** Reads the label page's parameters; an unknown template reads as `auto`. */
export function readLabelParams(search: URLSearchParams): LabelParams {
  const template = search.get('template');
  return {
    ids: parseIds(search.get('ids')),
    template: isTemplateChoice(template) ? template : 'auto',
    sheetId: search.get('sheet'),
    contents: search.get('contents') === '1',
  };
}

/** The link that opens the label page on these items. */
export function labelsHref(ids: readonly string[], options: { contents?: boolean } = {}): string {
  const search = new URLSearchParams({ ids: ids.slice(0, MAX_LABEL_IDS).join(',') });
  if (options.contents) search.set('contents', '1');
  return `/inventory/labels?${search.toString()}`;
}
