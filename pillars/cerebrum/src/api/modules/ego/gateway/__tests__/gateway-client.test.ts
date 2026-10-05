import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { McpGatewayClient } from '../gateway-client.js';
import { startGatewayTestServer } from './gateway-test-server.js';

let gateway: Awaited<ReturnType<typeof startGatewayTestServer>>;

beforeAll(async () => {
  gateway = await startGatewayTestServer();
});

afterAll(async () => {
  await gateway.close();
});

describe('McpGatewayClient', () => {
  it('follows pagination and carries readOnlyHint through unchanged', async () => {
    const tools = await new McpGatewayClient(gateway).listTools();
    expect(tools.map((tool) => [tool.name, tool.readOnlyHint])).toEqual([
      ['read_thing', true],
      ['plain_thing', undefined],
      ['hang', undefined],
    ]);
    expect(tools[0]?.description).toBe('reads');
  });

  it('joins text blocks and returns the handler text', async () => {
    const result = await new McpGatewayClient(gateway).callTool('read_thing', { value: 'x' });
    expect(result).toEqual({ text: 'got x\nsecond', isError: false });
  });

  it('maps isError', async () => {
    const result = await new McpGatewayClient(gateway).callTool('plain_thing', {});
    expect(result).toEqual({ text: 'it broke', isError: true });
  });

  it('rejects with a wrong token', async () => {
    await expect(
      new McpGatewayClient({ url: gateway.url, token: 'wrong' }).listTools()
    ).rejects.toThrow();
  });

  it('rejects a hanging tool within the timeout', async () => {
    const started = Date.now();
    await expect(
      new McpGatewayClient({ ...gateway, timeoutMs: 200 }).callTool('hang', {})
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
