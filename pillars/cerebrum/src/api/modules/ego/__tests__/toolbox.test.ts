import { describe, expect, it, vi } from 'vitest';

import { composeToolboxes, readOnlyToolbox } from '../toolbox.js';

import type { EgoToolDefinition, EgoToolbox, ToolOutcome } from '../toolbox.js';

function definition(name: string, write = false): EgoToolDefinition {
  return {
    name,
    label: name,
    description: 'Description for ' + name,
    inputSchema: { type: 'object' },
    ...(write ? { write: true } : {}),
  };
}

function fakeToolbox(definitions: EgoToolDefinition[], outcome: ToolOutcome) {
  const getDefinitions = vi.fn<EgoToolbox['definitions']>().mockResolvedValue(definitions);
  const dispatch = vi.fn<EgoToolbox['dispatch']>().mockResolvedValue(outcome);
  const toolbox: EgoToolbox = { definitions: getDefinitions, dispatch };
  return { toolbox, getDefinitions, dispatch };
}

describe('composeToolboxes', () => {
  it('concatenates definitions and dispatches to each owning toolbox', async () => {
    const firstOutcome: ToolOutcome = { kind: 'result', text: 'first', isError: false };
    const secondOutcome: ToolOutcome = { kind: 'result', text: 'second', isError: false };
    const first = fakeToolbox([definition('finance__summary')], firstOutcome);
    const second = fakeToolbox([definition('inventory__items')], secondOutcome);
    const toolbox = composeToolboxes(first.toolbox, second.toolbox);
    const input = { limit: 5 };

    expect(await toolbox.definitions()).toEqual([
      definition('finance__summary'),
      definition('inventory__items'),
    ]);
    expect(await toolbox.dispatch('finance__summary', input)).toEqual(firstOutcome);
    expect(await toolbox.dispatch('inventory__items', input)).toEqual(secondOutcome);
    expect(first.dispatch).toHaveBeenCalledWith('finance__summary', input);
    expect(second.dispatch).toHaveBeenCalledWith('inventory__items', input);
  });

  it('routes names according to the latest definitions snapshot', async () => {
    const outcome: ToolOutcome = { kind: 'result', text: 'owned', isError: false };
    const first = fakeToolbox([definition('shared_name')], outcome);
    const second = fakeToolbox([], outcome);
    const toolbox = composeToolboxes(first.toolbox, second.toolbox);

    await toolbox.definitions();
    first.getDefinitions.mockResolvedValue([]);
    second.getDefinitions.mockResolvedValue([definition('shared_name')]);

    await toolbox.definitions();
    await toolbox.dispatch('shared_name', {});

    expect(first.dispatch).not.toHaveBeenCalled();
    expect(second.dispatch).toHaveBeenCalledWith('shared_name', {});
  });

  it('rejects duplicate names across toolboxes', async () => {
    const outcome: ToolOutcome = { kind: 'result', text: '', isError: false };
    const first = fakeToolbox([definition('duplicate_name')], outcome);
    const second = fakeToolbox([definition('duplicate_name')], outcome);

    await expect(composeToolboxes(first.toolbox, second.toolbox).definitions()).rejects.toThrow(
      'duplicate_name'
    );
  });

  it('returns an error result when no toolbox owns the name', async () => {
    const outcome: ToolOutcome = { kind: 'result', text: '', isError: false };
    const toolbox = composeToolboxes(fakeToolbox([definition('known_name')], outcome).toolbox);
    await toolbox.definitions();

    expect(await toolbox.dispatch('unknown_name', {})).toEqual({
      kind: 'result',
      text: 'Unknown tool: unknown_name',
      isError: true,
    });
  });
});

describe('readOnlyToolbox', () => {
  it('filters writes, rejects hidden dispatches, and passes through reads and local tools', async () => {
    const read = definition('finance__summary');
    const write = definition('finance__transactions__create', true);
    const local = definition('ego_navigate');
    const outcome: ToolOutcome = { kind: 'result', text: 'ok', isError: false };
    const { toolbox: inner, dispatch } = fakeToolbox([read, write, local], outcome);
    const toolbox = readOnlyToolbox(inner);
    const input = { id: 'tx_1' };

    expect(await toolbox.definitions()).toEqual([read, local]);
    expect(await toolbox.dispatch(write.name, input)).toEqual({
      kind: 'result',
      text: 'Unknown tool: ' + write.name,
      isError: true,
    });
    expect(dispatch).not.toHaveBeenCalled();

    expect(await toolbox.dispatch(read.name, input)).toBe(outcome);
    expect(await toolbox.dispatch(local.name, input)).toBe(outcome);
    expect(dispatch).toHaveBeenNthCalledWith(1, read.name, input);
    expect(dispatch).toHaveBeenNthCalledWith(2, local.name, input);
  });
});
