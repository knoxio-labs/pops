import { BfmApiError } from '../../../bfm-api-helpers.js';

/** Recovery states do not claim a conflict's cause or imply that an uncertain write was rolled back. */
export type GrantFailure = 'read' | 'conflict' | 'unconfirmed' | 'refused' | 'missing' | 'rejected';

/** Classifies only published status meanings; uncertain writes require a read before another attempt. */
export function grantFailure(error: unknown, writing: boolean): GrantFailure {
  if (!(error instanceof BfmApiError)) return writing ? 'unconfirmed' : 'read';
  if (error.status === 409) return 'conflict';
  if (error.status === 404) return 'missing';
  if (error.status === 401 || error.status === 403) return 'refused';
  if (writing && error.status === 400) return 'rejected';
  return writing ? 'unconfirmed' : 'read';
}
