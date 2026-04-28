/**
 * i18n-compatible error message registry.
 *
 * Each key maps to an EN-AU message template. Interpolation placeholders use
 * `{{name}}` syntax so both server-side and client-side formatters can resolve
 * them consistently.
 *
 * The server always returns the EN-AU string in the `message` field and the
 * error key in a `messageKey` field. The frontend translates using the key.
 */

/** All valid error message keys. */
export type ErrorMessageKey = keyof typeof ERROR_MESSAGES;

/**
 * Registry of error keys → EN-AU message templates.
 *
 * Organised by domain: common, finance, media, inventory, cerebrum, core.
 */
export const ERROR_MESSAGES = {
  // ── Common / generic ────────────────────────────────────────────────
  'common.notFound': "{{resource}} '{{id}}' not found",
  'common.conflict': '{{resource}} already exists',
  'common.validationFailed': 'Validation failed',
  'common.noFieldsToUpdate': 'No fields to update',
  'common.internalError': 'An unexpected error occurred',

  // ── Finance ─────────────────────────────────────────────────────────
  'finance.import.sessionNotFound': 'Import session not found',
  'finance.import.sessionNotReady': 'Import session is not ready for re-evaluation',
  'finance.import.sessionNotProcessResult': 'Import session result is not a processImport result',
  'finance.import.commitValidationFailed': 'Import commit validation failed: {{detail}}',

  // ── Media — Library ─────────────────────────────────────────────────
  'media.library.movieNotFoundOnTmdb': 'Movie not found on TMDB (ID: {{tmdbId}})',
  'media.library.tmdbApiError': 'TMDB API error: {{detail}}',
  'media.library.tvdbApiError': 'TheTVDB API error: {{detail}}',

  // ── Media — Plex ────────────────────────────────────────────────────
  'media.plex.notConfigured': 'Plex is not configured. Connect to Plex in settings first.',
  'media.plex.invalidUrl':
    'Invalid URL format. Please provide a valid address (e.g., http://192.168.1.100:32400)',
  'media.plex.connectionFailed':
    'Could not connect to Plex server at {{url}}. Verify the address is correct and the server is reachable.',
  'media.plex.apiError': 'Plex API error: {{detail}}',
  'media.plex.pinFailed': 'Failed to get Plex PIN (HTTP {{status}})',
  'media.plex.pinCheckFailed': 'Failed to check Plex PIN (HTTP {{status}})',
  'media.plex.pinNotFound': 'Invalid or expired PIN ID',

  // ── Media — Arr (Radarr/Sonarr) ────────────────────────────────────
  'media.arr.radarrNotConfigured': 'Radarr is not configured',
  'media.arr.sonarrNotConfigured': 'Sonarr is not configured',
  'media.arr.apiError': '{{service}} error: {{detail}}',
  'media.arr.serviceNotConfigured': '{{service}} not configured',

  // ── Media — Rotation ────────────────────────────────────────────────
  'media.rotation.candidateNotFound': 'Candidate not found',
  'media.rotation.candidateAlreadyProcessed': 'Candidate is already {{status}}',
  'media.rotation.radarrConfigMissing': 'Radarr quality profile or root folder not configured',
  'media.rotation.radarrNotConfigured': 'Radarr not configured',
  'media.rotation.sourceNotFound': 'Source not found',
  'media.rotation.cannotDeleteManualSource': 'Cannot delete the manual source',
  'media.rotation.movieExcludedFromRotation': 'Movie is excluded from rotation',

  // ── Media — Retrieval / Search ──────────────────────────────────────
  'media.retrieval.queryRequired': 'Query is required for semantic and hybrid search modes',
  'media.retrieval.filterRequired': 'Structured search requires at least one filter',
  'media.retrieval.contextQueryRequired': 'Query is required for context assembly',

  // ── Inventory ───────────────────────────────────────────────────────
  'inventory.reports.insuranceReportFailed': 'Failed to generate insurance report: {{detail}}',
  'inventory.reports.valueByLocationFailed':
    'Failed to load value by location breakdown: {{detail}}',
  'inventory.reports.valueByTypeFailed': 'Failed to load value by type breakdown: {{detail}}',
  'inventory.paperless.notConfigured': 'Paperless-ngx is not configured',
  'inventory.paperless.apiError': 'Paperless error: {{detail}}',

  // ── Cerebrum — Nudges ───────────────────────────────────────────────
  'cerebrum.nudge.notFound': "Nudge '{{id}}' not found",
  'cerebrum.nudge.notPendingOrMissing': "Nudge '{{id}}' is not pending or does not exist",

  // ── Cerebrum — Templates ────────────────────────────────────────────
  'cerebrum.template.notFound': "Template '{{name}}' not found",

  // ── Cerebrum — Reflex ───────────────────────────────────────────────
  'cerebrum.reflex.notFound': 'Reflex "{{name}}" not found',

  // ── Cerebrum — Emit ─────────────────────────────────────────────────
  'cerebrum.emit.invalidDateRange': 'Invalid date range: from must be before or equal to to',
  'cerebrum.emit.queryRequiredForReport': 'Query is required for report mode',
  'cerebrum.emit.dateRangeRequiredForSummary': 'Date range is required for summary mode',

  // ── Core — Corrections ──────────────────────────────────────────────
  'core.corrections.revisionFailed': 'Failed to revise ChangeSet: {{detail}}',
  'core.corrections.revisionFailedGeneric': 'Failed to revise ChangeSet',
} as const;

/** Interpolation params — a simple string record. */
export type ErrorMessageParams = Record<string, string>;

/**
 * Resolve an error message key to its EN-AU string, interpolating any
 * `{{placeholder}}` tokens with the given params.
 *
 * @example
 * ```ts
 * errorMessage('common.notFound', { resource: 'Budget', id: '42' });
 * // → "Budget '42' not found"
 * ```
 */
export function errorMessage(key: ErrorMessageKey, params?: ErrorMessageParams): string {
  const template: string = ERROR_MESSAGES[key];
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => params[name] ?? '');
}
