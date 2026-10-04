import { LocalToolbox } from '../local-tools.js';
import { composeToolboxes } from '../toolbox.js';
import { defaultUriResolvers } from '../uri/index.js';
import { ObjectUriResolver } from '../uri/resolver.js';
import { McpGatewayClient } from './gateway-client.js';
import { readGatewayConfig } from './gateway-config.js';
import { GatewayToolbox } from './gateway-toolbox.js';

import type { EgoTools } from '../toolbox.js';

const NOT_CONFIGURED_WARNING =
  '[cerebrum-ego] gateway not configured, tools disabled (set CEREBRUM_EGO_MCP_URL and a token)';

let warnedGatewayNotConfigured = false;

/** Reset the one-shot missing-gateway warning between tests. */
export function resetBuildEgoToolsWarningForTests(): void {
  warnedGatewayNotConfigured = false;
}

/** Build the gateway and local Ego tools from environment configuration. */
export function buildEgoTools(env: NodeJS.ProcessEnv = process.env): EgoTools | null {
  const config = readGatewayConfig(env);
  if (config === null) {
    if (!warnedGatewayNotConfigured) {
      warnedGatewayNotConfigured = true;
      console.warn(NOT_CONFIGURED_WARNING);
    }
    return null;
  }

  const client = new McpGatewayClient(config);
  const resolver = new ObjectUriResolver(client, defaultUriResolvers);
  const toolbox = composeToolboxes(new GatewayToolbox(client), new LocalToolbox(resolver));

  void toolbox.definitions().then(
    (definitions) => {
      console.warn('[cerebrum-ego] gateway toolbox ready: ' + definitions.length + ' tools');
    },
    () => {
      console.warn('[cerebrum-ego] gateway toolbox failed to initialize');
    }
  );

  return { toolbox, gateway: client };
}
