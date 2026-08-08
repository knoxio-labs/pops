/**
 * Barrel for the bfm pillar's persistence services — the operations the API
 * layer performs against `bfm.db`, as opposed to the table definitions next
 * door in `../schema/`.
 */
export {
  listDevices,
  revokeDevice,
  type DeviceSummary,
  type RevokeDeviceResult,
} from './devices.js';

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
