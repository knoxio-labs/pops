/**
 * bfm domain table barrel.
 *
 * Three tables, and the whole of the pillar's persistence. They describe one
 * thing — which phones may reach the federation, and on what evidence:
 *
 *   pairing_codes   the one-time secret an operator reads out
 *        │          (consumed exactly once)
 *        ▼
 *   devices         the paired handset and its Secure Enclave public key
 *        │          (revoked by soft delete, never removed)
 *        ▼
 *   refresh_tokens  a rotating chain per pairing, self-linked through
 *                   `replacedBy` so reuse is detectable
 *
 * Only `refresh_tokens → devices` is a foreign key. A pairing code is
 * deliberately NOT linked to the device it produced: the code is a secret
 * whose whole purpose is to be forgotten, and a link would let a stolen
 * database walk from a device back to the credential that created it.
 *
 * Nothing here stores a usable credential. Both bearer-shaped values — the
 * pairing code and the refresh token — are persisted as hashes only.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { devices as devicesTable } from './schema/devices.js';
import type { pairingCodes as pairingCodesTable } from './schema/pairing-codes.js';
import type { refreshTokens as refreshTokensTable } from './schema/refresh-tokens.js';

export { devices } from './schema/devices.js';
export { pairingCodes } from './schema/pairing-codes.js';
export { refreshTokens } from './schema/refresh-tokens.js';

export type DeviceRow = InferSelectModel<typeof devicesTable>;
export type DeviceInsert = InferInsertModel<typeof devicesTable>;
export type PairingCodeRow = InferSelectModel<typeof pairingCodesTable>;
export type PairingCodeInsert = InferInsertModel<typeof pairingCodesTable>;
export type RefreshTokenRow = InferSelectModel<typeof refreshTokensTable>;
export type RefreshTokenInsert = InferInsertModel<typeof refreshTokensTable>;
