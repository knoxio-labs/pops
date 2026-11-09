import { readFileSync } from 'node:fs';

import { configureServerSdk } from '@pops/pillar-sdk/server';

/** Configure authenticated outbound discovery, preferring a mounted secret over the local-dev environment. */
export function configureTripsServerSdk(
  env: NodeJS.ProcessEnv = process.env,
  readText: (path: string) => string = (path) => readFileSync(path, 'utf8')
): boolean {
  const path = env['POPS_INTERNAL_API_KEY_FILE']?.trim();
  const fromFile = path ? readText(path).trim() : '';
  const apiKey = fromFile || env['POPS_INTERNAL_API_KEY']?.trim() || undefined;
  configureServerSdk({ apiKey });
  return apiKey !== undefined;
}
