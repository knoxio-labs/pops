import { randomUUID } from 'node:crypto';

/**
 * Request an iOS pairing code through the POPS MCP gateway.
 *
 * The caller stays on the host because neither pairing material nor the MCP
 * bearer secret belongs in a simulator-facing process.
 */

const MCP_PROTOCOL_VERSION = '2025-06-18';
const TOOL_NAME = 'bfm.devicePairing.issueCode';

/** @typedef {{ code: string, pairingUrl: string, expiresAt: string }} PairingCode */
/** @typedef {'mcp-transport' | 'mcp-http' | 'mcp-response' | 'mcp-tool' | 'mcp-metadata'} PairingFailureStage */
/** @typedef {{ content: unknown[], isError: boolean }} McpToolResult */

/** An MCP pairing failure with a static stage and no response details. */
export class PairingMcpFailure extends Error {
  /**
   * @param {PairingFailureStage} stage
   * @param {number} [httpStatus]
   */
  constructor(stage, httpStatus) {
    super('MCP pairing handoff failed');
    this.name = 'PairingMcpFailure';
    this.stage = stage;
    this.httpStatus = httpStatus;
  }
}

/**
 * Creates an isolated inbound credential for the locally spawned MCP gateway.
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
 * Checks that the local gateway is ready with both credentials and at least one registered tool.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isMcpReadyResponse(value) {
  return (
    isRecord(value) &&
    value['status'] === 'ready' &&
    value['apiKeyConfigured'] === true &&
    value['inboundAuthConfigured'] === true &&
    typeof value['tools'] === 'number' &&
    Number.isSafeInteger(value['tools']) &&
    value['tools'] > 0
  );
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
  return parsePairingToolContent(parseMcpToolResult(body, contentType));
}

/**
 * Calls one MCP tool through the stateless Streamable HTTP endpoint. Returned
 * content can contain pairing credentials and must stay out of logs.
 *
 * @param {{
 *   endpoint: string,
 *   token?: string,
 *   name: string,
 *   arguments: Record<string, unknown>,
 *   fetchImpl?: typeof fetch
 * }} options
 * @returns {Promise<McpToolResult>}
 */
export async function callMcpTool({
  endpoint,
  token,
  name,
  arguments: toolArguments,
  fetchImpl = fetch,
}) {
  const { body, contentType } = await sendMcpRequest({
    endpoint,
    token,
    method: 'tools/call',
    params: { name, arguments: toolArguments },
    fetchImpl,
  });
  return parseMcpToolResult(body, contentType);
}

/**
 * Checks the authenticated MCP tool list for the pairing-code issuer without calling it.
 *
 * @param {{ endpoint: string, token?: string, fetchImpl?: typeof fetch, signal?: AbortSignal }} options
 * @returns {Promise<boolean>}
 */
export async function hasPairingCodeIssuerTool({ endpoint, token, fetchImpl = fetch, signal }) {
  const { body, contentType } = await sendMcpRequest({
    endpoint,
    token,
    method: 'tools/list',
    params: {},
    fetchImpl,
    signal,
  });
  const message = parseJsonRpcMessage(body, contentType);
  const toolList =
    isRecord(message) && isRecord(message['result']) ? message['result']['tools'] : null;
  if (
    !isRecord(message) ||
    !isRecord(message['result']) ||
    message['error'] !== undefined ||
    !Array.isArray(toolList) ||
    toolList.some(
      /** @param {unknown} tool */
      (tool) => !isRecord(tool) || typeof tool['name'] !== 'string'
    )
  ) {
    throw new PairingMcpFailure('mcp-response');
  }
  return toolList.some(
    /** @param {unknown} tool */
    (tool) => isRecord(tool) && tool['name'] === TOOL_NAME
  );
}

/**
 * Sends one stateless Streamable HTTP MCP request and reads its private response body.
 *
 * @param {{ endpoint: string, token?: string, method: 'tools/call' | 'tools/list', params: Record<string, unknown>, fetchImpl: typeof fetch, signal?: AbortSignal }} options
 * @returns {Promise<{ body: string, contentType: string | null }>}
 */
async function sendMcpRequest({ endpoint, token, method, params, fetchImpl, signal }) {
  const headers = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    ...(token === undefined || token.trim() === ''
      ? {}
      : { authorization: `Bearer ${token.trim()}` }),
  };
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    throw new PairingMcpFailure('mcp-transport');
  }
  if (!response.ok) throw new PairingMcpFailure('mcp-http', response.status);

  let body;
  try {
    body = await response.text();
  } catch {
    throw new PairingMcpFailure('mcp-response');
  }
  return { body, contentType: response.headers.get('content-type') };
}

/**
 * Calls the BFM pairing-code MCP tool and validates its metadata.
 *
 * @param {{ endpoint: string, token?: string, fetchImpl?: typeof fetch }} options
 * @returns {Promise<PairingCode>}
 */
export async function issuePairingCodeViaMcp({ endpoint, token, fetchImpl = fetch }) {
  const result = await callMcpTool({
    endpoint,
    token,
    name: TOOL_NAME,
    arguments: {},
    fetchImpl,
  });
  return parsePairingToolContent(result);
}

/**
 * Formats a pairing failure without exposing MCP or BFM response content.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function formatPairingMcpFailure(error) {
  if (!(error instanceof PairingMcpFailure))
    return 'ios-e2e: MCP pairing handoff failed at an unknown stage; issuance status is unknown. No retry was attempted.';

  const status = error.httpStatus === undefined ? '' : ` (HTTP ${error.httpStatus})`;
  return `ios-e2e: MCP pairing handoff failed at ${error.stage}${status}; issuance status is unknown. No retry was attempted.`;
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
    throw new PairingMcpFailure('mcp-response');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new PairingMcpFailure('mcp-response');
  }
}

/**
 * @param {string} body
 * @param {string | null} contentType
 * @returns {McpToolResult}
 */
function parseMcpToolResult(body, contentType) {
  const message = parseJsonRpcMessage(body, contentType);
  if (!isRecord(message) || !isRecord(message['result']) || message['error'] !== undefined)
    throw new PairingMcpFailure('mcp-response');

  const result = message['result'];
  const content = result['content'];
  if (!Array.isArray(content)) throw new PairingMcpFailure('mcp-response');
  if (result['isError'] !== undefined && typeof result['isError'] !== 'boolean') {
    throw new PairingMcpFailure('mcp-response');
  }

  return { content, isError: result['isError'] === true };
}

/**
 * @param {McpToolResult} result
 * @returns {PairingCode}
 */
function parsePairingToolContent(result) {
  if (result.isError) throw new PairingMcpFailure('mcp-tool');

  const textItem = result.content.find(
    (item) => isRecord(item) && item['type'] === 'text' && typeof item['text'] === 'string'
  );
  if (!isRecord(textItem) || typeof textItem['text'] !== 'string') {
    throw new PairingMcpFailure('mcp-response');
  }

  let payload;
  try {
    payload = JSON.parse(textItem['text']);
  } catch {
    throw new PairingMcpFailure('mcp-metadata');
  }
  if (!isPairingCode(payload)) throw new PairingMcpFailure('mcp-metadata');
  return payload;
}

/**
 * Checks the exact response shape the BFM pairing issuers return.
 *
 * @param {unknown} value
 * @returns {value is PairingCode}
 */
export function isPairingCode(value) {
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
