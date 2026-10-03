import { readFileSync } from 'node:fs';

/** Connection details for the POPS MCP gateway Ego calls tools through. */
export interface GatewayConfig {
  url: string;
  token: string;
}

function readTokenFile(env: NodeJS.ProcessEnv): string | undefined {
  const filePath = env['CEREBRUM_EGO_MCP_TOKEN_FILE'];
  if (filePath === undefined || filePath === '') return undefined;
  try {
    const fromFile = readFileSync(filePath, 'utf-8').trim();
    return fromFile !== '' ? fromFile : undefined;
  } catch (err) {
    console.warn(
      `[cerebrum] failed to read CEREBRUM_EGO_MCP_TOKEN_FILE (${filePath}): ${
        err instanceof Error ? err.message : String(err)
      } — falling back to CEREBRUM_EGO_MCP_TOKEN`
    );
    return undefined;
  }
}

/**
 * Resolve the gateway URL and bearer token from the environment.
 *
 * The token comes from the file named by `CEREBRUM_EGO_MCP_TOKEN_FILE` (trimmed)
 * and falls back to `CEREBRUM_EGO_MCP_TOKEN` when the file is unset, unreadable
 * or empty. A failed file read logs a warning naming the path, never the token.
 *
 * @returns the config, or `null` when the URL or the token is missing or empty.
 */
export function readGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig | null {
  const url = env['CEREBRUM_EGO_MCP_URL'];
  if (url === undefined || url === '') return null;
  const fromEnv = env['CEREBRUM_EGO_MCP_TOKEN'];
  const token =
    readTokenFile(env) ?? (fromEnv !== undefined && fromEnv !== '' ? fromEnv : undefined);
  return token === undefined ? null : { url, token };
}
