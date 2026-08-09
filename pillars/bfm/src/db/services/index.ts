/**
 * Barrel for the bfm pillar's persistence services — the operations the API
 * layer performs against `bfm.db`, as opposed to the table definitions next
 * door in `../schema/`.
 */
export {
  insertDevice,
  listDevices,
  revokeDevice,
  type DeviceSummary,
  type InsertDeviceValues,
  type RevokeDeviceResult,
} from './devices.js';

export {
  DEFAULT_REFRESH_TOKEN_TTL_MS,
  findRefreshTokenByHash,
  generateRefreshToken,
  hashRefreshToken,
  insertRefreshToken,
  REFRESH_TOKEN_BYTES,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
  type InsertRefreshTokenValues,
  type RefreshTokenRecord,
  type RotateRefreshTokenResult,
  type RotateRefreshTokenValues,
} from './refresh-tokens.js';

export {
  DEFAULT_PAIRING_CODE_TTL_MS,
  generatePairingCode,
  hashPairingCode,
  issuePairingCode,
  normalizePairingCode,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_GROUP_SIZE,
  PAIRING_CODE_LENGTH,
  redeemPairingCode,
  type IssuedPairingCode,
  type IssuePairingCodeOptions,
} from './pairing-codes.js';

export {
  assertRefreshTokenRetentionCoversTtl,
  PAIRING_CODE_RETENTION_MS,
  pruneDeadRefreshTokens,
  prunePairingCodes,
  REFRESH_TOKEN_RETENTION_MS,
  RefreshTokenRetentionError,
  type PruneOptions,
} from './prune-credentials.js';
