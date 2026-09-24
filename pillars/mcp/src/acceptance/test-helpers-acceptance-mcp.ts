/**
 * Drives the inventory MCP tools the way an agent does — by tool name, with
 * a JSON argument bag — and parses what comes back. Every call goes through
 * the real tool handler, `pillar-client.ts` and a real HTTP round trip to
 * the stack `test-helpers-acceptance-stack.ts` booted.
 */
import { z } from 'zod';

import { inventoryTools } from '../tools/inventory.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const enumOptionSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  archivedAt: z.string().nullable(),
});
const fieldSchema = z.object({
  id: z.string(),
  typeId: z.string(),
  key: z.string(),
  label: z.string(),
  kind: z.string(),
  cardinality: z.enum(['one', 'many']),
  storage: z.enum(['stored', 'computed']),
  archivedAt: z.string().nullable(),
  enumOptions: z.array(enumOptionSchema),
});
const typeSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  archivedAt: z.string().nullable(),
  fields: z.array(fieldSchema),
});
/** The parts of a catalogue descriptor the acceptance scenarios read. */
export const descriptorSchema = z.object({
  revision: z.object({
    revision: z.number().int().positive(),
    draftVersion: z.number().int().positive(),
    minimumProtocol: z.number().int().positive(),
    status: z.string(),
  }),
  types: z.array(typeSchema),
});
export type Descriptor = z.infer<typeof descriptorSchema>;
export type DescriptorType = z.infer<typeof typeSchema>;
export type DescriptorField = z.infer<typeof fieldSchema>;

const patchedSchema = z.object({ draft: descriptorSchema });
const mutationPayloadSchema = z.object({
  itemId: z.string(),
  outcome: z.object({ status: z.string(), revision: z.number().int().optional() }),
});

/** One computed value as `inventory.items.get` reports it. */
export const computedValueSchema = z.object({
  fieldId: z.string(),
  state: z.enum(['ok', 'overridden', 'unavailable']),
  values: z.array(z.unknown()).optional(),
  reason: z.string().optional(),
});
/** The parts of an item the acceptance scenarios read. */
export const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  revision: z.number().int(),
  typeId: z.string().nullable(),
  fieldValues: z.array(
    z.object({ fieldId: z.string(), source: z.string(), values: z.array(z.unknown()) })
  ),
  computedValues: z.array(computedValueSchema).default([]),
});
export type AcceptanceItem = z.infer<typeof itemSchema>;
const itemEnvelopeSchema = z.object({ item: itemSchema });

function text(result: CallToolResult): string {
  const first = result.content[0];
  if (first === undefined || first.type !== 'text') throw new Error('expected text content');
  return first.text;
}

/** A tool call's outcome: parsed JSON when it succeeded, its message when it did not. */
export type ToolOutcome = { ok: true; body: unknown } | { ok: false; message: string };

/** Calls one inventory MCP tool by its published name. */
export async function callTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  const tool = inventoryTools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`no inventory MCP tool named ${name}`);
  const result = await tool.handler(args);
  const message = text(result);
  if (result.isError === true) return { ok: false, message };
  return { ok: true, body: JSON.parse(message) };
}

/** Calls a tool that must succeed and returns its parsed body. */
export async function mustCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  const outcome = await callTool(name, args);
  if (!outcome.ok) throw new Error(`${name} failed: ${outcome.message}`);
  return outcome.body;
}

/** Calls a tool that must fail and returns its error message. */
export async function mustRefuse(name: string, args: Record<string, unknown>): Promise<string> {
  const outcome = await callTool(name, args);
  if (outcome.ok)
    throw new Error(`${name} unexpectedly succeeded: ${JSON.stringify(outcome.body)}`);
  return outcome.message;
}

/** Reads the published catalogue through `inventory.catalogue.get`. */
export async function publishedCatalogue(): Promise<Descriptor> {
  return descriptorSchema.parse(await mustCall('inventory.catalogue.get', {}));
}

/** Finds a type by key, failing loudly when it is absent. */
export function typeByKey(descriptor: Descriptor, key: string): DescriptorType {
  const found = descriptor.types.find((type) => type.key === key);
  if (found === undefined) throw new Error(`catalogue has no type ${key}`);
  return found;
}

/** Finds a field by key on a type, failing loudly when it is absent. */
export function fieldByKey(type: DescriptorType, key: string): DescriptorField {
  const found = type.fields.find((field) => field.key === key);
  if (found === undefined) throw new Error(`type ${type.key} has no field ${key}`);
  return found;
}

/**
 * One catalogue draft as an MCP agent holds it: the revision, the base it
 * was cut from and the draft version last read, which every mutating call
 * sends back as `expectedDraftVersion`.
 */
export class DraftSession {
  private constructor(
    readonly revision: number,
    readonly baseRevision: number,
    private draftVersion: number,
    private latest: Descriptor
  ) {}

  /** Cuts a new draft from the currently published revision. */
  static async open(): Promise<DraftSession> {
    const published = await publishedCatalogue();
    const baseRevision = published.revision.revision;
    const created = descriptorSchema.parse(
      await mustCall('inventory.catalogue.createDraft', { baseRevision })
    );
    return new DraftSession(
      created.revision.revision,
      baseRevision,
      created.revision.draftVersion,
      created
    );
  }

  /** Resumes the persisted draft through `readDraft`, the way a second session would. */
  static async resume(baseRevision: number): Promise<DraftSession> {
    const read = await mustCall('inventory.catalogue.readDraft', {});
    const body = z.union([patchedSchema, descriptorSchema]).parse(read);
    const draft = 'draft' in body ? body.draft : body;
    return new DraftSession(
      draft.revision.revision,
      baseRevision,
      draft.revision.draftVersion,
      draft
    );
  }

  get version(): number {
    return this.draftVersion;
  }

  get descriptor(): Descriptor {
    return this.latest;
  }

  private target(expectedDraftVersion = this.draftVersion): Record<string, unknown> {
    return { revision: this.revision, baseRevision: this.baseRevision, expectedDraftVersion };
  }

  /** Applies operations; the draft version advances on success. */
  async patch(operations: readonly Record<string, unknown>[]): Promise<Descriptor> {
    const patched = patchedSchema.parse(
      await mustCall('inventory.catalogue.patchDraft', { ...this.target(), operations })
    );
    this.draftVersion = patched.draft.revision.draftVersion;
    this.latest = patched.draft;
    return patched.draft;
  }

  /** Sends a patch at an explicit (possibly stale) draft version and returns the outcome. */
  async patchAt(
    expectedDraftVersion: number,
    operations: readonly Record<string, unknown>[]
  ): Promise<ToolOutcome> {
    return callTool('inventory.catalogue.patchDraft', {
      ...this.target(expectedDraftVersion),
      operations,
    });
  }

  /** Previews the draft with `operations` applied on top, without changing it. */
  async preview(operations: readonly Record<string, unknown>[]): Promise<ToolOutcome> {
    return callTool('inventory.catalogue.previewDraft', { ...this.target(), operations });
  }

  /** Publishes the draft; returns the tool outcome so a refusal can be asserted. */
  async publish(extra: Record<string, unknown> = {}): Promise<ToolOutcome> {
    return callTool('inventory.catalogue.publishDraft', { ...this.target(), ...extra });
  }

  /** Publishes the draft and returns the new published descriptor. */
  async mustPublish(extra: Record<string, unknown> = {}): Promise<Descriptor> {
    const outcome = await this.publish(extra);
    if (!outcome.ok) throw new Error(`publishDraft failed: ${outcome.message}`);
    return descriptorSchema.parse(outcome.body);
  }

  /** Abandons the draft. */
  async abandon(): Promise<void> {
    await mustCall('inventory.catalogue.abandonDraft', this.target());
  }
}

/** Reads one item through `inventory.items.get`. */
export async function getItem(id: string): Promise<AcceptanceItem> {
  return itemEnvelopeSchema.parse(await mustCall('inventory.items.get', { id })).item;
}

/** Runs an item mutation tool that must apply and returns the item's new revision. */
export async function mutateItem(name: string, args: Record<string, unknown>): Promise<number> {
  const payload = mutationPayloadSchema.parse(await mustCall(name, args));
  if (payload.outcome.status !== 'applied' || payload.outcome.revision === undefined) {
    throw new Error(`${name} did not apply: ${JSON.stringify(payload.outcome)}`);
  }
  return payload.outcome.revision;
}

/** The stored values of one field on an item, or `undefined` when it has none. */
export function storedValues(item: AcceptanceItem, fieldId: string): unknown[] | undefined {
  return item.fieldValues.find((entry) => entry.fieldId === fieldId && entry.source === 'stored')
    ?.values;
}

/** The computed entry for one field on an item, failing loudly when it is absent. */
export function computedEntry(
  item: AcceptanceItem,
  fieldId: string
): z.infer<typeof computedValueSchema> {
  const found = item.computedValues.find((entry) => entry.fieldId === fieldId);
  if (found === undefined) throw new Error(`item ${item.id} has no computed value for ${fieldId}`);
  return found;
}
