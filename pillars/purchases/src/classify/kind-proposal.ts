/**
 * What a model is allowed to say about what a line item is, and how that
 * answer is read back.
 *
 * Pure. The Anthropic wiring is a separate file with no judgement in it, so
 * everything that decides whether an answer may be written is tested
 * against fixtures rather than against whatever a model said that day —
 * the same arrangement the receipt reader uses.
 *
 * **`unknown` is a first-class answer.** A model asked to choose between
 * four kinds will always choose one; without somewhere to put "the name
 * does not say", a `Gift Card - $50` becomes `durable` and an inventory
 * prompt about it arrives forever. A measured lexical classifier left 54%
 * of Amazon spend with no opinion, so the honest rate of not-knowing is
 * high, and NULL is the state the column is designed around.
 */
import { z } from 'zod';

import { firstJsonObject } from '../ai/model-json.js';
import { ITEM_KINDS } from '../contract/constants.js';

import type { ItemKind } from '../contract/constants.js';
import type { ProposalCandidate } from './batch.js';

/** A kind, or an explicit refusal to pick one. */
export const PROPOSED_KINDS = [...ITEM_KINDS, 'unknown'] as const;
export type ProposedKind = (typeof PROPOSED_KINDS)[number];

const KindProposalSchema = z.object({
  /**
   * The number the prompt listed the product under. An index rather than
   * the batching key, because a key is long, contains JSON punctuation, and
   * a model that has to echo it exactly will eventually not.
   *
   * Unbounded here, and range-checked when it is mapped: a number naming no
   * product in this batch is an answer about something else, and dropping
   * one is better than failing the batch it arrived with.
   */
  id: z.number().int(),
  kind: z.enum(PROPOSED_KINDS),
});

const KindProposalsSchema = z.object({ proposals: z.array(KindProposalSchema) });

export class KindProposalShapeError extends Error {}

/**
 * The instruction, with the batch listed under one-based numbers.
 *
 * The product name is all the model gets, because it is all the sources
 * state. The merchant is included because it is genuine evidence — a line
 * from a grocery receipt is a different prior from a line from a hardware
 * store — and the product identifier because an ASIN is sometimes
 * recognisable. Its scheme goes with it: `asin B07XYZ1234` tells the model
 * what kind of string it is looking at, where a bare one is noise.
 *
 * A candidate whose lines came from more than one merchant is listed with
 * no merchant at all. Printing the first line's would be evidence about one
 * line offered as evidence about the product, and the prompt is the place
 * that costs most: the model is being asked to generalise from it.
 */
export function kindPrompt(candidates: readonly ProposalCandidate[]): string {
  const listed = candidates
    .map((candidate, index) => {
      const sku = candidate.sku === null ? '' : ` [${candidate.sku.scheme} ${candidate.sku.value}]`;
      const merchant = candidate.source === null ? '' : `(${candidate.source}) `;
      return `${String(index + 1)}. ${merchant}${candidate.name}${sku}`;
    })
    .join('\n');

  return [
    'Classify each purchased line item below into exactly one kind.',
    '',
    'consumable — used up and re-bought: food, drink, detergent, printer ink, batteries.',
    'durable — a lasting physical object worth tracking: appliances, tools, furniture, electronics.',
    'digital — has no physical form: software, an ebook, a subscription, a gift card balance.',
    'service — labour or access rather than a thing: delivery, a repair, a membership.',
    'unknown — the name does not say.',
    '',
    'Answer "unknown" whenever the name is uninformative, ambiguous, or an',
    'abbreviation you cannot resolve. A wrong "durable" puts junk in front of',
    'the user and a wrong "consumable" hides a real possession forever, while',
    '"unknown" costs nothing but a later question. Do not guess.',
    '',
    'Reply with JSON only, one entry per number, in this shape:',
    '{"proposals":[{"id":1,"kind":"durable"}]}',
    '',
    'Items:',
    listed,
  ].join('\n');
}

/**
 * Read the model's answer back onto batching keys.
 *
 * Only entries naming a number in this batch are kept, and `unknown` is
 * dropped rather than recorded — the caller writes nothing for a key that
 * is absent from the result, which is the same outcome as never having
 * asked. A model that answers about item 47 of a 40-item batch is answering
 * about something else.
 */
export function readKindProposals(
  raw: string,
  candidates: readonly ProposalCandidate[]
): ReadonlyMap<string, ItemKind> {
  const json = firstJsonObject(raw);
  if (json === null) throw new KindProposalShapeError('the model returned no JSON object');

  let decoded: unknown;
  try {
    decoded = JSON.parse(json);
  } catch (error) {
    throw new KindProposalShapeError(`the model returned unparseable JSON: ${String(error)}`);
  }

  const parsed = KindProposalsSchema.safeParse(decoded);
  if (!parsed.success) {
    const faults = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`
    );
    throw new KindProposalShapeError(faults.join('; '));
  }

  const byKey = new Map<string, ItemKind>();
  for (const proposal of parsed.data.proposals) {
    if (proposal.kind === 'unknown') continue;
    const candidate = candidates[proposal.id - 1];
    if (candidate === undefined) continue;
    // First answer wins. A model that answers the same number twice with
    // two kinds has contradicted itself, and picking the later one would
    // make the result depend on the order it happened to emit them in.
    if (!byKey.has(candidate.key)) byKey.set(candidate.key, proposal.kind);
  }
  return byKey;
}
