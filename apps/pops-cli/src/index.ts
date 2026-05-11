#!/usr/bin/env node
/**
 * `pops` CLI entrypoint. Spec: PRD-081 US-03 (capture) and follow-on ask.
 *
 * Reads `POPS_API_URL` (default `http://localhost:3000`) and
 * `POPS_API_KEY` (optional, sent as `X-API-Key` for service-account auth)
 * from the environment.
 */
import { Command } from 'commander';

import { runAsk } from './commands/cerebrum-ask.js';
import { runCapture } from './commands/cerebrum-capture.js';

function buildProgram(): Command {
  const program = new Command();
  program
    .name('pops')
    .description('POPS personal operations CLI')
    .version('0.1.0', '-v, --version');

  const cerebrum = program.command('cerebrum').description('Cerebrum knowledge base commands');

  cerebrum
    .command('capture')
    .description('Capture a thought into the engram store (PRD-081 US-03)')
    .argument('[text...]', 'text to capture; if omitted, read from stdin')
    .option('--source <source>', 'engram source override', 'cli')
    .action(async (text: string[], opts: { source?: string }) => {
      const joined = text.length > 0 ? text.join(' ') : undefined;
      const code = await runCapture({ text: joined, source: opts.source });
      if (code !== 0) process.exitCode = code;
    });

  cerebrum
    .command('ask')
    .description('Ask a natural-language question against the engram store')
    .argument('[question...]', 'question to ask; if omitted, read from stdin')
    .option('--scope <scope>', 'limit to one or more scopes (repeatable)', collect, [])
    .action(async (question: string[], opts: { scope: string[] }) => {
      const joined = question.length > 0 ? question.join(' ') : undefined;
      const code = await runAsk({ question: joined, scopes: opts.scope });
      if (code !== 0) process.exitCode = code;
    });

  return program;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

const program = buildProgram();
program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
