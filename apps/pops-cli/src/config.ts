/**
 * CLI configuration — resolves API base URL and auth header from the
 * environment. Kept tiny on purpose: the CLI is a single-file binary in
 * spirit, and config surface should be discoverable from --help.
 */

const DEFAULT_API_URL = 'http://localhost:3000';

export interface CliConfig {
  apiUrl: string;
  apiKey: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CliConfig {
  const rawUrl = env['POPS_API_URL']?.trim();
  const apiUrl = rawUrl && rawUrl.length > 0 ? rawUrl.replace(/\/$/, '') : DEFAULT_API_URL;
  const apiKey = env['POPS_API_KEY']?.trim() || undefined;
  return { apiUrl, apiKey };
}
