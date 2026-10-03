import { afterEach, describe, expect, it, vi } from 'vitest';

import { GatewayToolbox, summariseWrite } from '../gateway-toolbox.js';

import type { GatewayCaller, GatewayTool } from '../gateway-client.js';

const inputSchema = { type: 'object', properties: { query: { type: 'string' } } };

function gatewayTool(name: string, readOnlyHint?: boolean): GatewayTool {
  return {
    name,
    description: 'Description for ' + name,
    inputSchema,
    readOnlyHint,
  };
}

function fakeCaller(tools: GatewayTool[] = []) {
  const listTools = vi.fn<GatewayCaller['listTools']>().mockResolvedValue(tools);
  const callTool = vi
    .fn<GatewayCaller['callTool']>()
    .mockResolvedValue({ text: 'read result', isError: false });
  const caller: GatewayCaller = { listTools, callTool };
  return { caller, listTools, callTool };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GatewayToolbox', () => {
  it('maps dotted names for the model and dispatches reads with the original name and input', async () => {
    const { caller, callTool } = fakeCaller([gatewayTool('finance.summary.get', true)]);
    const toolbox = new GatewayToolbox(caller);
    const input = { query: 'coffee' };

    const definitions = await toolbox.definitions();

    expect(definitions).toEqual([
      {
        name: 'finance__summary__get',
        label: 'finance.summary.get',
        description: 'Description for finance.summary.get',
        inputSchema,
      },
    ]);
    expect(await toolbox.dispatch('finance__summary__get', input)).toEqual({
      kind: 'result',
      text: 'read result',
      isError: false,
    });
    expect(callTool).toHaveBeenCalledWith('finance.summary.get', input);
  });

  it('treats false or missing readOnlyHint as writes in both definitions and dispatch', async () => {
    const { caller, callTool } = fakeCaller([
      gatewayTool('finance.write.missing'),
      gatewayTool('finance.write.false', false),
      gatewayTool('finance.read', true),
    ]);
    const toolbox = new GatewayToolbox(caller);
    const input = { amount: 12 };
    const definitions = await toolbox.definitions();

    expect(definitions.find((tool) => tool.name === 'finance__write__missing')?.write).toBe(true);
    expect(definitions.find((tool) => tool.name === 'finance__write__false')?.write).toBe(true);
    expect(definitions.find((tool) => tool.name === 'finance__read')).not.toHaveProperty('write');

    expect(await toolbox.dispatch('finance__write__missing', input)).toEqual({
      kind: 'write',
      tool: 'finance.write.missing',
      args: input,
      summary: 'finance.write.missing ' + JSON.stringify(input),
    });
    expect(await toolbox.dispatch('finance__write__false', input)).toEqual({
      kind: 'write',
      tool: 'finance.write.false',
      args: input,
      summary: 'finance.write.false ' + JSON.stringify(input),
    });
    expect(callTool).not.toHaveBeenCalled();
  });

  it('caches successful tool catalogues for the configured TTL', async () => {
    const { caller, listTools } = fakeCaller([gatewayTool('finance.summary.get', true)]);
    let now = 0;
    const toolbox = new GatewayToolbox(caller, { ttlMs: 10, now: () => now });

    await toolbox.definitions();
    await toolbox.definitions();
    expect(listTools).toHaveBeenCalledTimes(1);

    now = 11;
    await toolbox.definitions();
    await toolbox.definitions();
    expect(listTools).toHaveBeenCalledTimes(2);
  });

  it('returns a previous catalogue after a list failure and retries the failure', async () => {
    const { caller, listTools } = fakeCaller([gatewayTool('finance.summary.get', true)]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let now = 0;
    const toolbox = new GatewayToolbox(caller, { ttlMs: 10, now: () => now });
    const first = await toolbox.definitions();
    now = 11;
    listTools.mockRejectedValueOnce(new Error('gateway unavailable'));

    expect(await toolbox.definitions()).toEqual(first);
    expect(await toolbox.definitions()).toEqual(first);
    expect(listTools).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('returns an empty catalogue after an initial failure and retries next time', async () => {
    const { caller, listTools } = fakeCaller();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const toolbox = new GatewayToolbox(caller);
    listTools.mockRejectedValueOnce(new Error('gateway unavailable'));

    expect(await toolbox.definitions()).toEqual([]);
    expect(await toolbox.definitions()).toEqual([]);
    expect(listTools).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('skips overlong, invalid and duplicate model names with one warning per skipped tool', async () => {
    const { caller } = fakeCaller([
      gatewayTool('finance.summary.get', true),
      gatewayTool('finance__summary__get', true),
      gatewayTool('not a valid name', true),
      gatewayTool('a'.repeat(70), true),
    ]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const toolbox = new GatewayToolbox(caller);

    const definitions = await toolbox.definitions();

    expect(definitions.map((tool) => tool.name)).toEqual(['finance__summary__get']);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('returns gateway call failures as error results', async () => {
    const { caller, callTool } = fakeCaller([gatewayTool('finance.summary.get', true)]);
    const toolbox = new GatewayToolbox(caller);
    await toolbox.definitions();
    callTool.mockRejectedValueOnce(new Error('gateway call failed'));

    expect(await toolbox.dispatch('finance__summary__get', {})).toEqual({
      kind: 'result',
      text: 'gateway call failed',
      isError: true,
    });
  });

  it('returns an error result for an unknown tool name', async () => {
    const toolbox = new GatewayToolbox(fakeCaller().caller);
    expect(await toolbox.dispatch('missing_tool', {})).toEqual({
      kind: 'result',
      text: 'Unknown tool: missing_tool',
      isError: true,
    });
  });

  it('caps write summaries at 200 characters', () => {
    expect(summariseWrite('finance.write', { value: 'x'.repeat(250) })).toHaveLength(200);
  });
});
