import { suggestItemCodes, type CodeSuggestionRequest } from './inventory-sync-client.js';
import { mapCallResult, optStr, reqStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

/** The inventory scope `POST /codes/suggest` is gated by. */
const INVENTORY_CODES_SCOPE = 'inventory.codes.suggest';

const STEM_PATTERN = /^[A-Za-z0-9-]{0,15}[A-Za-z-]$/;

function optionalNonEmpty(
  args: Record<string, unknown>,
  key: string
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (!(key in args)) return { ok: true, value: undefined };
  const value = optStr(args, key)?.trim();
  if (value === undefined || value === '') return { ok: false, error: `Invalid field: ${key}` };
  return { ok: true, value };
}

function parseRequest(
  args: Record<string, unknown>
): { ok: true; value: CodeSuggestionRequest } | { ok: false; error: string } {
  const name = reqStr(args, 'itemName')?.trim();
  if (name === undefined || name === '') return { ok: false, error: 'itemName is required' };
  const request: CodeSuggestionRequest = { name };
  for (const [arg, key] of [
    ['typeKey', 'typeKey'],
    ['locationId', 'locationId'],
    ['containerId', 'containerId'],
    ['stem', 'stem'],
  ] as const) {
    const parsed = optionalNonEmpty(args, arg);
    if (!parsed.ok) return parsed;
    if (parsed.value !== undefined) request[key] = parsed.value;
  }
  if (request.stem !== undefined && !STEM_PATTERN.test(request.stem)) {
    return {
      ok: false,
      error: 'stem must be up to 16 letters, digits or hyphens and must not end in a digit',
    };
  }
  if (request.locationId !== undefined && request.containerId !== undefined) {
    return { ok: false, error: 'Give locationId or containerId, not both' };
  }
  return { ok: true, value: request };
}

/** Suggests free sticker codes for a new item, the same suggestions the item forms offer. */
export const codeSuggestTool: ToolDef = {
  name: 'inventory.codes.suggest',
  readOnly: true,
  description:
    'Suggest free sticker codes for a new item, best first. Suggestions follow the code families already in use (for example BOX-OFFICE-5 after BOX-OFFICE-4) and take the destination into account; every one is checked to be unused. Pass the code you choose to inventory.items.create or inventory.items.update. An empty list means suggestions are turned off.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      itemName: { type: 'string', minLength: 1, description: 'The new item name' },
      typeKey: { type: 'string', minLength: 1, description: 'Published type key, e.g. book' },
      locationId: { type: 'string', minLength: 1, description: 'Location it will be stored in' },
      containerId: { type: 'string', minLength: 1, description: 'Container it will be stored in' },
      stem: {
        type: 'string',
        pattern: STEM_PATTERN.source,
        description: 'Required code prefix, e.g. BK-NOVEL-; must not end in a digit',
      },
    },
    required: ['itemName'],
  },
  scope: INVENTORY_CODES_SCOPE,
  handler: async (args) => {
    const request = parseRequest(args);
    if (!request.ok) return toolError(request.error);
    return mapCallResult(await suggestItemCodes(request.value), INVENTORY_CODES_SCOPE);
  },
};
