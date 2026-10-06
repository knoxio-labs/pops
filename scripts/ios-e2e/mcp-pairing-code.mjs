#!/usr/bin/env node
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
        method: 'tools/call',
        params: { name, arguments: toolArguments },
      }),
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
  return parseMcpToolResult(body, response.headers.get('content-type'));
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
      process.stderr.write(`${formatPairingMcpFailure(error)}\n`);
      process.exitCode = 1;
    }
  }
}
