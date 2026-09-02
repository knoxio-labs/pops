#!/usr/bin/env node
/**
 * MCP server over the design playground's comment API — a session reads,
 * replies to and resolves threads as tools rather than as curl invocations.
 *
 * Registered in the repo-root `.mcp.json`. Authentication is the Cloudflare
 * Access service token in `.env`, the same credential the dev proxy uses, so
 * a session and a browser see the same threads.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { createClient, threadsQuery } from './design-feedback.mjs';

const client = createClient();

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function api(path, init) {
  if ('error' in client) return { error: client.error };
  return client.call(path, init);
}

/** @param {unknown} data */
function asResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

const STATUS = z.enum(['open', 'applied', 'rejected', 'outdated']);

const server = new McpServer({ name: 'design-feedback', version: '1.0.0' });

server.registerTool(
  'list_threads',
  {
    description:
      'List comment threads left on the design playground, with their messages. ' +
      'Defaults to OPEN threads only — applied, rejected and outdated ones are ' +
      'hidden to save tokens. Pass a status to filter to one, or includeResolved ' +
      'to return every status.',
    inputSchema: {
      status: STATUS.optional().describe('Filter to one status. Omit for open only.'),
      includeResolved: z.boolean().optional().describe('Return every status, not just open.'),
      route: z
        .string()
        .optional()
        .describe('Filter to one playground address, e.g. /s/finance/import-review'),
      since: z
        .string()
        .optional()
        .describe('ISO timestamp — only threads created or replied to after it.'),
    },
  },
  async ({ status, includeResolved, route, since }) =>
    asResult(
      await api(
        threadsQuery({
          status: status ?? (includeResolved === true ? undefined : 'open'),
          route,
          since,
        })
      )
    )
);

server.registerTool(
  'reply_to_thread',
  {
    description:
      'Reply to a comment thread. The reply is visible in the playground overlay — ' +
      'use it to say what was changed, or why the comment was not acted on.',
    inputSchema: {
      thread_id: z.string(),
      body: z.string(),
    },
  },
  async ({ thread_id, body }) =>
    asResult(
      await api(`/threads/${thread_id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body, author: 'Claude' }),
      })
    )
);

server.registerTool(
  'set_thread_status',
  {
    description:
      'Set a thread’s status: applied (the change is made), rejected (say why in a ' +
      'reply first), outdated (the anchor no longer resolves), or open (reopen it).',
    inputSchema: {
      thread_id: z.string(),
      status: STATUS,
    },
  },
  async ({ thread_id, status }) =>
    asResult(
      await api(`/threads/${thread_id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    )
);

await server.connect(new StdioServerTransport());
