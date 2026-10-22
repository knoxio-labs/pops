/** The inventory `items.*Parts` procedures for {@link createInventoryFake}. */
import type { CallResult } from '@pops/pillar-sdk/server';

/** Which parts procedure a call reached. */
export type InventoryPartsProcedure = 'getParts' | 'addPart' | 'removePart';

/** One recorded parts call, with the flat SDK input it carried. */
export interface InventoryPartsCall {
  readonly procedure: InventoryPartsProcedure;
  readonly input: unknown;
}

/** What a parts procedure answers for one call. */
export type InventoryPartsResult = (
  procedure: InventoryPartsProcedure,
  input: unknown
) => CallResult<unknown>;

/** An empty assembly view, wrapped the way inventory answers it. */
export function emptyPartsResult(): CallResult<unknown> {
  return { kind: 'ok', value: { data: { canHaveParts: true, assembly: null, parts: [] } } };
}

export function makePartsProcedures(
  result: InventoryPartsResult | undefined,
  calls: InventoryPartsCall[]
): Record<InventoryPartsProcedure, (rawInput: unknown) => Promise<CallResult<unknown>>> {
  const answer = (procedure: InventoryPartsProcedure) => (rawInput: unknown) => {
    calls.push({ procedure, input: rawInput });
    return Promise.resolve(result === undefined ? emptyPartsResult() : result(procedure, rawInput));
  };
  return {
    getParts: answer('getParts'),
    addPart: answer('addPart'),
    removePart: answer('removePart'),
  };
}
