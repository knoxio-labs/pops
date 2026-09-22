#!/usr/bin/env node
/**
 * Revokes the disposable Apple development certificates minted by TestFlight CI.
 *
 * Hosted macOS runners have no persistent keychain, so automatic signing creates
 * a certificate named `Created via API` for each archive job. Those certificates
 * outlive the runner and eventually exhaust the Apple team's development-certificate
 * quota. This preflight removes only that exact name and only development types;
 * distribution certificates and human-named development certificates are never
 * candidates.
 */

import { sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API_ORIGIN = 'https://api.appstoreconnect.apple.com';
const DISPOSABLE_DISPLAY_NAME = 'Created via API';
const DEVELOPMENT_TYPES = new Set(['DEVELOPMENT', 'IOS_DEVELOPMENT']);
const MAX_DISPOSABLE_CERTIFICATES = 10;

/**
 * @typedef {{
 *   id: string,
 *   type: 'certificates',
 *   attributes: { displayName?: string, certificateType?: string }
 * }} Certificate
 */

/**
 * Selects only certificates that Xcode automatic signing created for ephemeral CI.
 * Refuses an implausibly large match set so an upstream response-shape or naming
 * change cannot turn a narrow cleanup into an unbounded revocation.
 *
 * @param {readonly Certificate[]} certificates
 * @returns {Certificate[]}
 */
export function disposableDevelopmentCertificates(certificates) {
  const selected = certificates.filter(
    ({ attributes }) =>
      attributes.displayName === DISPOSABLE_DISPLAY_NAME &&
      DEVELOPMENT_TYPES.has(attributes.certificateType ?? '')
  );
  if (selected.length > MAX_DISPOSABLE_CERTIFICATES) {
    throw new Error(
      `refusing to revoke ${selected.length} certificates; expected at most ${MAX_DISPOSABLE_CERTIFICATES}`
    );
  }
  return selected;
}

/**
 * Creates a short-lived App Store Connect API token from the existing CI key.
 *
 * @param {{ keyId: string, issuerId: string, privateKey: string, now?: number }} input
 * @returns {string}
 */
export function createToken({ keyId, issuerId, privateKey, now = Math.floor(Date.now() / 1000) }) {
  /** @param {unknown} value */
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const payload = encode({ iss: issuerId, iat: now, exp: now + 120, aud: 'appstoreconnect-v1' });
  const signingInput = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${signingInput}.${signature}`;
}

/**
 * Lists Apple certificates and revokes the disposable development certificates.
 *
 * @param {{ token: string, request?: typeof fetch }} input
 * @returns {Promise<number>} number of revoked certificates
 */
export async function pruneCertificates({ token, request = fetch }) {
  const headers = { Authorization: `Bearer ${token}` };
  const listUrl = new URL('/v1/certificates', API_ORIGIN);
  listUrl.searchParams.set(
    'fields[certificates]',
    'displayName,certificateType,expirationDate,activated'
  );
  listUrl.searchParams.set('limit', '200');
  const response = await request(listUrl, { headers });
  if (!response.ok) throw new Error(`certificate list failed with HTTP ${response.status}`);
  /** @type {{ data?: Certificate[] }} */
  const body = await response.json();
  if (!Array.isArray(body.data)) throw new Error('certificate list returned no data array');

  const disposable = disposableDevelopmentCertificates(body.data);
  for (const certificate of disposable) {
    const revoke = await request(new URL(`/v1/certificates/${certificate.id}`, API_ORIGIN), {
      method: 'DELETE',
      headers,
    });
    if (!revoke.ok) {
      throw new Error(`certificate revocation failed with HTTP ${revoke.status}`);
    }
  }
  return disposable.length;
}

async function main() {
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) {
    throw new Error('ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH are required');
  }
  const token = createToken({
    keyId: ASC_KEY_ID,
    issuerId: ASC_ISSUER_ID,
    privateKey: readFileSync(ASC_KEY_PATH, 'utf8'),
  });
  const count = await pruneCertificates({ token });
  console.log(`revoked ${count} disposable development certificate(s)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
