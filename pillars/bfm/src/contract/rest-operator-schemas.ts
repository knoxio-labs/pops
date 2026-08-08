import { z } from 'zod';

/**
 * Wire schemas for the operator surface — the routes behind Cloudflare Access,
 * reached through the shell's nginx at `/bfm-api/`.
 */

/** Uniform error envelope. `code` is the thrown error's class name. */
export const ErrorBodySchema = z.object({
  message: z.string(),
  code: z.string(),
});

/**
 * Responses every operator route can produce. `401` is on all of them because
 * the principal gate is what makes them operator-only: bfm's hostname has
 * Cloudflare Access bypassed for the device-facing routes, so these handlers
 * are reachable from the public internet and their gate is load-bearing rather
 * than defence in depth.
 */
export const OPERATOR_ERR_RESPONSES = {
  401: ErrorBodySchema,
} as const;

/**
 * What `POST /operator/pairing/codes` returns.
 *
 * `code` is the ONLY time the plaintext exists outside the operator's screen —
 * only its digest is persisted, so a lost response means minting another.
 *
 * `pairingUrl` carries the BFM's public (Access-bypassed) origin alongside the
 * code so the Devices page (POPS-1387) can render one QR the phone scans, and
 * the handset learns where to send `POST /devices/pair` without being compiled
 * against a hostname.
 */
export const IssuedPairingCodeSchema = z.object({
  code: z.string(),
  pairingUrl: z.url(),
  expiresAt: z.iso.datetime(),
});

export type IssuedPairingCodeResponse = z.infer<typeof IssuedPairingCodeSchema>;

/**
 * A paired handset as the operator sees it. No token, no key, no digest — the
 * device's public key is deliberately not projected here (see
 * `db/services/devices.ts`).
 */
export const DeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  /** Null while trusted; the instant the operator cut it off otherwise. */
  revokedAt: z.iso.datetime().nullable(),
});

export type Device = z.infer<typeof DeviceSchema>;

export const DeviceListSchema = z.object({
  devices: z.array(DeviceSchema),
});

/**
 * Revocation's answer. `alreadyRevoked` distinguishes "this call cut the phone
 * off" from "it was already dead" without failing the second one — the
 * operator's intent is satisfied either way, and `revokedAt` is the original
 * instant, never the retry's.
 */
export const RevokedDeviceSchema = z.object({
  id: z.string(),
  revokedAt: z.iso.datetime(),
  alreadyRevoked: z.boolean(),
});

export type RevokedDevice = z.infer<typeof RevokedDeviceSchema>;
