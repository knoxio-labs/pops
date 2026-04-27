#!/usr/bin/env node
/**
 * pops cerebrum capture — quick capture: fire off a raw thought or note
 * that lands as an engram immediately and gets classified later by Cortex.
 *
 * Usage:
 *   pops cerebrum capture "Had a great idea about agent routing"
 *   echo "some notes" | pops cerebrum capture
 *
 * Connects to the running pops-api instance via tRPC HTTP.
 */
import { createTRPCClient, httpBatchLink } from '@trpc/client';

import type { AppRouter } from '../router.js';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const USAGE = `Usage: pops cerebrum capture [options] "text"

Captures raw text as an engram immediately. Classification and enrichment
run asynchronously in the background.

Options:
  --source <manual|agent|moltbot|cli>   Source channel (default: cli)
  --help, -h                            Show this help

Examples:
  pops cerebrum capture "Had a great idea about agent routing"
  echo "meeting notes..." | pops cerebrum capture
  pops cerebrum capture --source moltbot "Quick thought from phone"
`;

interface CaptureArgs {
  text: string;
  source: string;
}

function parseArgs(argv: string[]): CaptureArgs {
  const args = argv.slice(2);
  let source = 'cli';
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';

    if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    }

    if (arg === '--source' && i + 1 < args.length) {
      source = args[++i] ?? 'cli';
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  return { text: positional.join(' '), source };
}

// ---------------------------------------------------------------------------
// Piped input
// ---------------------------------------------------------------------------

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

// ---------------------------------------------------------------------------
// tRPC client
// ---------------------------------------------------------------------------

function createApiClient(): ReturnType<typeof createTRPCClient<AppRouter>> {
  const apiUrl = process.env['POPS_API_URL'] ?? 'http://localhost:3000';
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiUrl}/trpc`,
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
  const pipedContent = await readStdin();

  const text = parsed.text || pipedContent;
  if (!text.trim()) {
    process.stderr.write('Error: No text provided. Pass text as an argument or via stdin.\n\n');
    process.stderr.write(USAGE);
    process.exit(1);
  }

  const client = createApiClient();

  try {
    const result = await client.cerebrum.ingest.quickCapture.mutate({
      text,
      source: parsed.source,
    });

    const output = result as { id: string; path: string; type: string; scopes: string[] };
    process.stdout.write(`Captured: ${output.id}\n`);
    process.stdout.write(`  Path:   ${output.path}\n`);
    process.stdout.write(`  Type:   ${output.type}\n`);
    process.stdout.write(`  Scopes: ${output.scopes.join(', ')}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(1);
});
