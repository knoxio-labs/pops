import { z } from 'zod';

import type { CodeSuggestion, CodesSuggestRequest } from '../../../contract/rest-codes.js';

/** Bumped whenever the instructions below change, so the ledger can tell prompts apart. */
export const CODE_PROMPT_VERSION = 'codes-suggest-v1';

/** What a suggested code may contain. Inventory still decides whether it is free. */
const CODE_SHAPE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;

export const CODE_SYSTEM_PROMPT = `You suggest sticker codes for items in a personal home inventory. Codes are printed on small labels and typed by hand, so they must be short, readable and consistent with the codes the owner already uses.

How to choose:
- Read the existing codes first. Most belong to families that share a prefix, such as BOX-OFFICE-1, BOX-OFFICE-2 or BK-NOVEL-1. A family's prefix usually encodes what the thing is, where it lives, or both.
- When the new item fits an existing family, continue it: same prefix, same separator, same number style (keep zero-padding only if the family uses it), and the next number after the highest one in that family.
- When no family fits, start a new one in the owner's style: short uppercase segments joined by hyphens, a prefix a person would recognise from the item, its type or its destination, then a number.
- Prefer families that match where the item is going when the owner's codes are organised by room or container.
- Offer genuinely different options when more than one convention is plausible, rather than consecutive numbers of the same family.
- Never return a code that is already in use, compared case-insensitively.
- Use only letters, digits and hyphens, at most 32 characters.

For each code, give a reason of at most one short sentence that names the convention it follows.`;

/** JSON schema the reply is constrained to. */
export const CODE_REPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'reason'],
        properties: {
          code: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

const ReplySchema = z.object({
  suggestions: z.array(z.object({ code: z.string(), reason: z.string() })),
});

function existingLine(entry: CodesSuggestRequest['existing'][number]): string {
  return [entry.code, entry.name, entry.typeKey ?? '-', entry.place ?? '-'].join(' | ');
}

function itemLines(request: CodesSuggestRequest): string[] {
  const { item } = request;
  const type = item.typeLabel ?? item.typeKey ?? 'unknown';
  const key = item.typeKey === undefined ? '' : ` (${item.typeKey})`;
  return [
    `Name: ${item.name}`,
    `Type: ${type}${key}`,
    ...(item.isContainer === true ? ['It is a container that holds other items.'] : []),
  ];
}

function destinationLines(request: CodesSuggestRequest): string[] {
  const { destination } = request;
  if (destination === undefined) return ['Destination: not chosen yet'];
  const lines = [
    `Destination: ${destination.path.length > 0 ? destination.path.join(' > ') : 'unknown'}`,
  ];
  const { container } = destination;
  if (container !== undefined) {
    lines.push(
      `Inside container: ${container.name}${container.code === undefined ? '' : ` (code ${container.code})`}`
    );
  }
  return lines;
}

/**
 * The user turn for one suggestion request: the new item, where it is going,
 * an optional required prefix, and every existing code as
 * `code | item name | type key | place`.
 */
export function buildCodePrompt(request: CodesSuggestRequest): string {
  const existing =
    request.existing.length === 0
      ? ['(none yet)']
      : ['code | item | type | place', ...request.existing.map(existingLine)];
  return [
    'New item',
    ...itemLines(request),
    ...destinationLines(request),
    ...(request.stem === undefined
      ? []
      : [`Every code must start with "${request.stem}" (the owner already typed it).`]),
    '',
    `Existing codes (${String(request.existing.length)})`,
    ...existing,
    '',
    `Return exactly ${String(request.count)} suggestions, best first.`,
  ].join('\n');
}

/**
 * Parse and filter a model reply into at most `request.count` usable
 * suggestions: well-formed, starting with the required stem, not already in
 * use and not repeated (all compared case-insensitively).
 *
 * @returns null when the reply is not the JSON shape the schema demands.
 */
export function parseCodeReply(
  text: string,
  request: CodesSuggestRequest
): CodeSuggestion[] | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = ReplySchema.safeParse(json);
  if (!parsed.success) return null;

  const taken = new Set(request.existing.map((entry) => entry.code.toLowerCase()));
  const stem = request.stem?.toLowerCase();
  const accepted: CodeSuggestion[] = [];
  for (const suggestion of parsed.data.suggestions) {
    const code = suggestion.code.trim();
    const key = code.toLowerCase();
    if (!CODE_SHAPE.test(code) || taken.has(key)) continue;
    if (stem !== undefined && !key.startsWith(stem)) continue;
    taken.add(key);
    accepted.push({ code, reason: suggestion.reason.trim().slice(0, 200) });
    if (accepted.length === request.count) break;
  }
  return accepted;
}
