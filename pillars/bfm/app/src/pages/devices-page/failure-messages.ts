import type { OperatorFailure } from './operator-failures.js';

/**
 * Every failure the operator can be shown, mapped exhaustively so a new
 * `OperatorFailure` member is a type error here rather than a silently
 * untranslated screen.
 */
export const PAIRING_FAILURE_KEYS: Record<OperatorFailure, string> = {
  unavailable: 'pairing.failure.unavailable',
  'rate-limited': 'pairing.failure.rateLimited',
  refused: 'pairing.failure.refused',
};

export const REVOKE_FAILURE_KEYS: Record<OperatorFailure, string> = {
  unavailable: 'revoke.failure.unavailable',
  'rate-limited': 'revoke.failure.rateLimited',
  refused: 'revoke.failure.refused',
};

export const DEVICE_LIST_FAILURE_KEYS: Record<OperatorFailure, string> = {
  unavailable: 'devices.failure.unavailable',
  'rate-limited': 'devices.failure.rateLimited',
  refused: 'devices.failure.refused',
};
