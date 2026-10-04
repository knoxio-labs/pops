import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { NAVIGATE_TOOL, SHOW_ENTITIES_TOOL } from '../../local-tools.js';
import { buildEgoTools, resetBuildEgoToolsWarningForTests } from '../build-ego-tools.js';
import { startGatewayTestServer } from './gateway-test-server.js';

let gateway: Awaited<ReturnType<typeof startGatewayTestServer>>;

beforeAll(async () => {
  gateway = await startGatewayTestServer();
});

afterAll(async () => {
  await gateway.close();
});

beforeEach(() => {
  resetBuildEgoToolsWarningForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildEgoTools', () => {
  it('returns null and warns once when the gateway is not configured', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(buildEgoTools({})).toBeNull();
    expect(buildEgoTools({})).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[cerebrum-ego] gateway not configured, tools disabled (set CEREBRUM_EGO_MCP_URL and a token)'
    );
  });

  it('composes gateway and local tools and logs the warmed catalogue size', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tools = buildEgoTools({
      CEREBRUM_EGO_MCP_URL: gateway.url,
      CEREBRUM_EGO_MCP_TOKEN: gateway.token,
    });
    if (tools === null) throw new Error('Configured gateway should produce Ego tools.');

    const definitions = await tools.toolbox.definitions();
    expect(definitions.map(({ name }) => name)).toEqual([
      'read_thing',
      'plain_thing',
      'hang',
      SHOW_ENTITIES_TOOL,
      NAVIGATE_TOOL,
    ]);
    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledWith('[cerebrum-ego] gateway toolbox ready: 5 tools');
    });
    const logged = log.mock.calls.flat().join(' ');
    expect(logged).not.toContain(gateway.url);
    expect(logged).not.toContain(gateway.token);
  });

  it('keeps local tools available when the gateway connection is refused', async () => {
    const url = 'http://127.0.0.1:1/mcp';
    const token = 'offline-gateway-token';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tools = buildEgoTools({
      CEREBRUM_EGO_MCP_URL: url,
      CEREBRUM_EGO_MCP_TOKEN: token,
    });
    if (tools === null) throw new Error('Configured gateway should produce Ego tools.');

    const definitions = await tools.toolbox.definitions();
    expect(definitions.map(({ name }) => name)).toEqual([SHOW_ENTITIES_TOOL, NAVIGATE_TOOL]);
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith('[cerebrum-ego] gateway toolbox ready: 2 tools');
    });
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(url);
  });
});
