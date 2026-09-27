import type { ItemRowModel } from '../../foundation/model/model.js';
import type { WebConnectionRow } from '../../inventory-web/useConnectionsRegistry.js';
import type { WebItemsFilters } from '../../inventory-web/useWebItems.js';

/** The two endpoint kinds accepted by the connection service. */
export type ConnectionEnd =
  | { kind: 'item'; itemId: string }
  | { kind: 'fixture'; fixtureId: string };

/** The item fields needed to explain a local connection refusal. */
export interface RefusalItem {
  id: string;
  name: string;
  lifecycle: ItemRowModel['lifecycle'];
}

/** A resolved candidate endpoint and its item data, when applicable. */
export interface RefusalCandidate {
  end: ConnectionEnd;
  name: string;
  item?: RefusalItem;
}

/** A candidate used by the dialog's item and fixture pickers. */
export interface Candidate {
  end: ConnectionEnd | null;
  name: string;
  item?: ItemRowModel;
}

/** Display state for a failed connection mutation. */
export interface ConnectFailure {
  kind: 'already-connected' | 'message';
  message?: string;
}

function samePair(fromId: string, to: ConnectionEnd, rows: readonly WebConnectionRow[]): boolean {
  return rows.some((row) =>
    to.kind === 'fixture'
      ? row.item.id === fromId && row.far.kind === 'fixture' && row.far.id === to.fixtureId
      : (row.item.id === fromId && row.far.kind === 'item' && row.far.id === to.itemId) ||
        (row.item.id === to.itemId && row.far.kind === 'item' && row.far.id === fromId)
  );
}

/** Returns the exact local refusal sentence, or null when the pair is valid. */
export function connectRefusal(
  from: RefusalItem | null,
  to: RefusalCandidate | null,
  existing: readonly WebConnectionRow[]
): string | null {
  if (from === null || to === null || (to.end.kind === 'item' && to.item === undefined))
    return 'Choose both ends.';
  if (to.end.kind === 'item' && to.end.itemId === from.id)
    return 'An item cannot connect to itself.';
  const inactive = from.lifecycle === 'active' ? to.item : from;
  if (inactive !== undefined && inactive.lifecycle !== 'active')
    return `${inactive.name} is ${inactive.lifecycle}. Restore it before connecting it.`;
  return samePair(from.id, to.end, existing)
    ? `${from.name} and ${to.name} are already connected.`
    : null;
}

/** Converts `item:<id>` or `fixture:<id>` into an endpoint. */
export function endFromKey(key: string | null): ConnectionEnd | null {
  if (key === null) return null;
  const [kind, id, extra] = key.split(':');
  if (extra !== undefined || id === undefined || id === '') return null;
  if (kind === 'item') return { kind: 'item', itemId: id };
  if (kind === 'fixture') return { kind: 'fixture', fixtureId: id };
  return null;
}

/** Builds the server item filter for one dialog search field. */
export function itemQuery(query: string): WebItemsFilters {
  const filters: WebItemsFilters = { includeInactive: true, isContainer: 'false', sort: 'name' };
  const q = query.trim();
  return q === '' ? filters : { ...filters, q };
}

/** The read states used by candidate lists and the existing-edge guard. */
export type ReadStatus = 'pending' | 'error' | 'success';

/** Resolves a picker key against item or fixture rows. */
export function resolveCandidate(
  key: string | null,
  kind: ConnectionEnd['kind'],
  rows: readonly { id: string; name: string }[],
  items: readonly ItemRowModel[] = []
): Candidate | null {
  const end = endFromKey(key);
  if (end?.kind !== kind) return null;
  const id = end.kind === 'item' ? end.itemId : end.fixtureId;
  const row = rows.find((entry) => entry.id === id);
  return row === undefined
    ? { end, name: '' }
    : { end, name: row.name, item: items.find((entry) => entry.id === id) };
}

/** Computes placement status from the source hook's loading and error flags. */
export function placementStatus(value: { isLoading: boolean; isError: boolean }): ReadStatus {
  if (value.isError) return 'error';
  if (value.isLoading) return 'pending';
  return 'success';
}

/** Combines candidate, place, and optional existing-edge read states. */
export function statusFor(...states: ReadStatus[]): ReadStatus {
  if (states.includes('error')) return 'error';
  if (states.includes('pending')) return 'pending';
  return 'success';
}

/** Returns the exact read name used by a failed picker body. */
export function failedWhat(
  candidate: ReadStatus,
  kind: 'item' | 'fixture',
  places: ReadStatus
): string {
  if (candidate === 'error') return kind === 'item' ? 'Items' : 'Fixtures';
  if (places === 'error') return 'Rooms';
  return 'Existing connections';
}

function failureText(
  failure: ConnectFailure | null,
  from: Candidate,
  to: Candidate
): string | null {
  if (failure?.kind === 'already-connected')
    return `${from.name} and ${to.name} are already connected.`;
  if (failure?.kind === 'message') return failure.message ?? 'Connection failed.';
  return null;
}

/** Returns the exact outcome sentence and whether the mutation may run. */
export function connectVerdict(args: {
  from: Candidate | null;
  to: Candidate | null;
  status: ReadStatus;
  refusal: string | null;
  failure: ConnectFailure | null;
}): { ok: boolean; text: string; from: Candidate | null; to: Candidate | null } {
  const { from, to } = args;
  if (!hasName(from) || !hasName(to)) return { ok: false, text: 'Choose both ends.', from, to };
  if (args.status !== 'success')
    return { ok: false, text: 'Existing connections did not load.', from, to };
  const failure = failureText(args.failure, from, to);
  if (failure !== null) return { ok: false, text: failure, from, to };
  if (args.refusal !== null) return { ok: false, text: args.refusal, from, to };
  return {
    ok: from.item !== undefined && from.end?.kind === 'item' && to.end !== null,
    text: `${from.name} will be connected to ${to.name}.`,
    from,
    to,
  };
}

/** Reads an API status without inspecting an error message. */
export function responseStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

/** Returns the message for non-409 mutation failures. */
export function responseMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  )
    return error.message;
  return 'Connection failed.';
}

function hasName(candidate: Candidate | null): candidate is Candidate & { name: string } {
  return candidate !== null && candidate.name !== '';
}

/** Runs the selected connection and maps only a 409 to the local refusal. */
export async function connectAction(args: {
  canConnect: boolean;
  result: ReturnType<typeof connectVerdict>;
  connectItems: (fromId: string, toId: string) => Promise<void>;
  connectFixture: (fromId: string, fixtureId: string) => Promise<void>;
  update: (patch: { failure: ConnectFailure | null; isConnecting: boolean }) => void;
  close: () => void;
}): Promise<void> {
  const from = args.result.from?.end;
  const to = args.result.to?.end;
  if (!args.canConnect || from?.kind !== 'item' || to === null || to === undefined) return;
  args.update({ failure: null, isConnecting: true });
  try {
    if (to.kind === 'item') await args.connectItems(from.itemId, to.itemId);
    else await args.connectFixture(from.itemId, to.fixtureId);
    args.close();
  } catch (error) {
    const failure =
      responseStatus(error) === 409
        ? { kind: 'already-connected' as const }
        : { kind: 'message' as const, message: responseMessage(error) };
    args.update({ failure, isConnecting: false });
  }
}

/** Selects the server read that a candidate-column Retry button must refetch. */
export function retryFor(args: {
  kind: 'item' | 'fixture';
  candidate: ReadStatus;
  places: ReadStatus;
  item: () => void;
  fixture: () => void;
  rooms: () => void;
  connections: () => void;
}): () => void {
  if (args.candidate === 'error') return args.kind === 'item' ? args.item : args.fixture;
  return args.places === 'error' ? args.rooms : args.connections;
}
