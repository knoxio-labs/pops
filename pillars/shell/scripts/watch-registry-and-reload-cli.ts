#!/usr/bin/env tsx
/**
 * CLI entrypoint for the nginx event-reload watcher. Reads env,
 * wires up the optional health endpoint, and runs the watcher until
 * SIGINT/SIGTERM. Kept thin so the watcher core
 * (`watchRegistryAndReload`) stays test-friendly.
 */
import { isCliEntrypoint } from '@pops/pillar-sdk/node';

import { createNginxGeneratorHealth, startHealthEndpoint } from './nginx-generator-health.js';
import { readConfig, watchRegistryAndReload } from './watch-registry-and-reload.js';

import type { ReloadLogger } from './nginx-event-reload.js';

function formatErrorDetail(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err === undefined) return '';
  return String(err);
}

const consoleLogger: ReloadLogger = {
  info: (message) => process.stdout.write(`${message}\n`),
  error: (message, err) => {
    const detail = formatErrorDetail(err);
    process.stderr.write(detail.length > 0 ? `${message}: ${detail}\n` : `${message}\n`);
  },
};

async function main(): Promise<void> {
  const config = readConfig(process.env);
  const controller = new AbortController();
  const onSignal = (): void => controller.abort();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  const health = createNginxGeneratorHealth();
  let healthEndpoint: { close: () => Promise<void> } | undefined;
  if (config.healthPort !== null) {
    healthEndpoint = await startHealthEndpoint({
      health,
      port: config.healthPort,
      host: config.healthHost,
      path: config.healthPath,
    });
    consoleLogger.info(
      `watch-registry: health endpoint listening on ${config.healthHost}:${config.healthPort}${config.healthPath}`
    );
  }

  try {
    await watchRegistryAndReload(config, controller.signal, consoleLogger, { health });
  } finally {
    await healthEndpoint?.close();
  }
}

if (isCliEntrypoint(import.meta.url)) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`watch-registry-and-reload failed: ${message}\n`);
    process.exit(1);
  });
}

export { main };
