/**
 * {@link GatewayFailure} factories for `media-client.ts`.
 *
 * One factory per member the media client can actually produce, rather than
 * one generic composer taking `kind`/`status` as parameters — a generic
 * composer can only be typed by asserting the result IS a `GatewayFailure`,
 * which would let a mismatched kind/status pair through unchecked. Each of
 * these is checked structurally instead.
 */
import type { GatewayFailure, GatewayOutcome } from '../pillars/gateway.js';

export const INVENTORY_MEDIA_PILLAR_ID = 'inventory';

export function ok<T>(value: T): GatewayOutcome<T> {
  return { kind: 'ok', value };
}

export const unavailable = (detail?: string): GatewayFailure => ({
  kind: 'unavailable',
  pillar: INVENTORY_MEDIA_PILLAR_ID,
  status: 503,
  detail,
});

export const contractMismatch = (detail?: string): GatewayFailure => ({
  kind: 'contract-mismatch',
  pillar: INVENTORY_MEDIA_PILLAR_ID,
  status: 502,
  detail,
});

export const unsupportedMedia = (detail?: string): GatewayFailure => ({
  kind: 'unsupported-media',
  pillar: INVENTORY_MEDIA_PILLAR_ID,
  status: 415,
  detail,
});

export const invalidRequest = (detail?: string): GatewayFailure => ({
  kind: 'invalid-request',
  pillar: INVENTORY_MEDIA_PILLAR_ID,
  status: 400,
  detail,
});

export const gatewayMisconfigured = (detail?: string): GatewayFailure => ({
  kind: 'gateway-misconfigured',
  pillar: INVENTORY_MEDIA_PILLAR_ID,
  status: 502,
  detail,
});

export const notFound = (detail?: string): GatewayFailure => ({
  kind: 'not-found',
  pillar: INVENTORY_MEDIA_PILLAR_ID,
  status: 404,
  detail,
});
