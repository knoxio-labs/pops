#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
/**
 * Request an iOS pairing code through the POPS MCP gateway.
 *
 * The bridge stays on the host because the simulator flow must not carry the
 * MCP bearer secret. It prints only the pairing code on stdout; diagnostics
 * are deliberately generic so an MCP error body cannot become a secret sink.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MCP_PROTOCOL_VERSION = '2025-06-18';
const TOOL_NAME = 'bfm.devicePairing.issueCode';

/** @typedef {{ code: string, pairingUrl: string, expiresAt: string }} PairingCode */

/**
 * Create an isolated, per-run inbound credential for the locally spawned MCP
 * gateway. The explicit empty file setting prevents an inherited mounted-token
 * path from taking precedence over this test-only token.
 *
 * @returns {{ token: string, environment: NodeJS.ProcessEnv }}
 */
export function createMcpInboundAuth() {
  const token = randomUUID();
  return {
    token,
    environment: {
      MCP_INBOUND_TOKEN: token,
      MCP_INBOUND_TOKEN_FILE: '',
    },
  };
}

/**
 * Parse the JSON-RPC result emitted by a Streamable HTTP MCP response.
 *
 * Both direct JSON responses and server-sent-event responses are accepted so
 * the bridge remains compatible with MCP gateways that choose either response
 * mode.
 *
 * @param {string} body
 * @param {string | null} contentType
 * @returns {PairingCode}
 */
export function parsePairingCodeResponse(body, contentType) {
  const message = parseJsonRpcMessage(body, contentType);
  if (!isRecord(message) || !isRecord(message['result'])) {
    throw new Error('MCP pairing tool returned no result');
  }

  const content = message['result']['content'];
  if (!Array.isArray(content)) throw new Error('MCP pairing tool returned no content');
  const textItem = content.find(
    (item) => isRecord(item) && item['type'] === 'text' && typeof item['text'] === 'string'
  );
  if (!isRecord(textItem) || typeof textItem['text'] !== 'string') {
    throw new Error('MCP pairing tool returned no text payload');
  }

  let payload;
  try {
    payload = JSON.parse(textItem['text']);
  } catch {
    throw new Error('MCP pairing tool returned malformed pairing metadata');
  }
  if (!isPairingCode(payload))
    throw new Error('MCP pairing tool returned invalid pairing metadata');
  return payload;
}

/**
 * Call the pairing MCP tool.
 *
 * @param {{ endpoint: string, token?: string, fetchImpl?: typeof fetch }} options
 * @returns {Promise<PairingCode>}
 */
export async function issuePairingCodeViaMcp({ endpoint, token, fetchImpl = fetch }) {
  const headers = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    ...(token === undefined || token.trim() === ''
      ? {}
      : { authorization: `Bearer ${token.trim()}` }),
  };
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: TOOL_NAME, arguments: {} },
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`MCP pairing tool HTTP ${response.status}`);
  return parsePairingCodeResponse(body, response.headers.get('content-type'));
}

/**
 * @param {string} body
 * @param {string | null} contentType
 * @returns {unknown}
 */
function parseJsonRpcMessage(body, contentType) {
  if (contentType?.toLowerCase().startsWith('text/event-stream')) {
    const dataLines = body
      .split(/\r?\n/u)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .filter((line) => line.length > 0);
    for (const data of dataLines) {
      try {
        return JSON.parse(data);
      } catch {
        continue;
      }
    }
    throw new Error('MCP pairing tool returned no JSON event');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('MCP pairing tool returned invalid JSON');
  }
}

/**
 * @param {unknown} value
 * @returns {value is PairingCode}
 */
function isPairingCode(value) {
  return (
    isRecord(value) &&
    typeof value['code'] === 'string' &&
    typeof value['pairingUrl'] === 'string' &&
    typeof value['expiresAt'] === 'string' &&
    Object.keys(value).toSorted().join(',') === 'code,expiresAt,pairingUrl'
  );
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const endpoint = process.env['POPS_MCP_URL']?.trim();
  if (endpoint === undefined || endpoint.length === 0) {
    process.stderr.write('ios-e2e: POPS_MCP_URL is required for MCP pairing.\n');
    process.exitCode = 1;
  } else {
    try {
      const pairing = await issuePairingCodeViaMcp({
        endpoint,
        token: process.env['MCP_INBOUND_TOKEN'],
      });
      process.stdout.write(`${pairing.code}\n`);
    } catch (error) {
      process.stderr.write(
        `ios-e2e: MCP pairing failed: ${error instanceof Error ? error.message : 'unknown error'}\n`
      );
      process.exitCode = 1;
    }
  }
}
