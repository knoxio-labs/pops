#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { createToken } from './prune-testflight-certificates.mjs';

const API_ORIGIN = 'https://api.appstoreconnect.apple.com';
const DUPLICATE_BUILD_MESSAGE =
  'The bundle version must be higher than the previously uploaded version';
const SCHEME_BUNDLE_IDS = Object.freeze({
  Pops: 'com.knoxiolabs.pops',
  PopsPlayground: 'com.knoxiolabs.pops.playground',
});

/** @typedef {'Pops' | 'PopsPlayground'} TestFlightScheme */

/**
 * @typedef {{
 *   type?: string,
 *   id?: string,
 *   attributes?: Record<string, unknown>,
 *   relationships?: Record<string, unknown>
 * }} AppleResource
 */

/**
 * @typedef {{
 *   scheme: TestFlightScheme,
 *   bundleId: string,
 *   marketingVersion: string,
 *   buildNumber: string,
 *   sourceCommit: string,
 *   sourceCommitCount: string,
 *   exportOutput: string,
 *   token: string,
 *   request?: typeof fetch
 * }} VerifyDuplicateInput
 */

/**
 * @typedef {{
 *   scheme: TestFlightScheme,
 *   bundleId: string,
 *   marketingVersion: string,
 *   buildNumber: string,
 *   sourceCommit: string,
 *   uploadId: string
 * }} VerifiedUpload
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is AppleResource}
 */
function isAppleResource(value) {
  return isRecord(value);
}

/**
 * @param {AppleResource} resource
 * @param {string} field
 * @returns {string | undefined}
 */
function stringAttribute(resource, field) {
  const attributes = resource.attributes;
  if (!isRecord(attributes)) return undefined;
  const value = attributes[field];
  return typeof value === 'string' ? value : undefined;
}

/**
 * @param {Record<string, unknown>} body
 * @returns {AppleResource[]}
 */
function dataResources(body) {
  const data = body.data;
  if (!Array.isArray(data)) return [];
  return data.filter(isAppleResource);
}

/**
 * @param {string} scheme
 * @returns {TestFlightScheme}
 */
function parseScheme(scheme) {
  if (scheme === 'Pops' || scheme === 'PopsPlayground') return scheme;
  throw new Error(`unsupported TestFlight scheme '${scheme}'`);
}

/**
 * Returns the only bundle identifier that may be uploaded for a TestFlight scheme.
 *
 * @param {string} scheme
 * @returns {string}
 */
export function bundleIdForScheme(scheme) {
  return SCHEME_BUNDLE_IDS[parseScheme(scheme)];
}

/**
 * Verifies that the App Store Connect build number still identifies the selected source commit.
 *
 * The build number is the full-history commit count, so this check is the local half of the
 * source identity proof that accompanies the App Store Connect build-upload lookup.
 *
 * @param {{ sourceCommit: string, sourceCommitCount: string, buildNumber: string }} input
 */
export function assertSourceIdentity({ sourceCommit, sourceCommitCount, buildNumber }) {
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) {
    throw new Error('source commit must be the full 40-character commit id');
  }
  if (!/^\d+$/u.test(sourceCommitCount) || sourceCommitCount !== buildNumber) {
    throw new Error(
      `source commit count ${sourceCommitCount} does not match build number ${buildNumber}`
    );
  }
}

/**
 * Returns whether xcodebuild reported the one duplicate-build condition this workflow can prove.
 *
 * @param {string} output
 * @returns {boolean}
 */
export function isKnownDuplicateBuildResponse(output) {
  return output.includes(DUPLICATE_BUILD_MESSAGE);
}

/**
 * @param {string | URL} url
 * @param {HeadersInit} headers
 * @param {typeof fetch} request
 * @returns {Promise<Record<string, unknown>>}
 */
async function getJson(url, headers, request) {
  const response = await request(url, { headers });
  if (!response.ok)
    throw new Error(`App Store Connect request failed with HTTP ${response.status}`);
  const body = await response.json();
  if (!isRecord(body)) throw new Error('App Store Connect returned a non-object response');
  return body;
}

/**
 * Proves that a duplicate export is the same successful upload and can therefore be treated as a retry.
 *
 * @param {VerifyDuplicateInput} input
 * @returns {Promise<VerifiedUpload>}
 */
export async function verifyDuplicateBuild({
  scheme,
  bundleId,
  marketingVersion,
  buildNumber,
  sourceCommit,
  sourceCommitCount,
  exportOutput,
  token,
  request = fetch,
}) {
  const parsedScheme = parseScheme(scheme);
  if (bundleIdForScheme(parsedScheme) !== bundleId) {
    throw new Error(`scheme ${parsedScheme} does not produce bundle identifier ${bundleId}`);
  }
  if (!isKnownDuplicateBuildResponse(exportOutput)) {
    throw new Error('export failure was not the known duplicate-build response');
  }
  assertSourceIdentity({ sourceCommit, sourceCommitCount, buildNumber });

  const headers = {
    Accept: 'application/vnd.api+json',
    Authorization: `Bearer ${token}`,
  };
  const appsUrl = new URL('/v1/apps', API_ORIGIN);
  appsUrl.searchParams.set('filter[bundleId]', bundleId);
  appsUrl.searchParams.set('fields[apps]', 'bundleId');
  appsUrl.searchParams.set('limit', '2');
  const apps = dataResources(await getJson(appsUrl, headers, request)).filter(
    (resource) =>
      resource.type === 'apps' &&
      stringAttribute(resource, 'bundleId') === bundleId &&
      typeof resource.id === 'string'
  );
  if (apps.length !== 1) {
    throw new Error(`expected one App Store Connect app for ${bundleId}, found ${apps.length}`);
  }
  const appId = apps[0]?.id;
  if (appId === undefined) throw new Error(`App Store Connect app for ${bundleId} has no id`);

  const uploadsUrl = new URL(`/v1/apps/${encodeURIComponent(appId)}/buildUploads`, API_ORIGIN);
  uploadsUrl.searchParams.set('filter[cfBundleShortVersionString]', marketingVersion);
  uploadsUrl.searchParams.set('filter[cfBundleVersion]', buildNumber);
  uploadsUrl.searchParams.set('filter[platform]', 'IOS');
  uploadsUrl.searchParams.set(
    'fields[buildUploads]',
    'cfBundleShortVersionString,cfBundleVersion,state,platform,uploadedDate'
  );
  uploadsUrl.searchParams.set('limit', '200');
  const uploadsBody = await getJson(uploadsUrl, headers, request);
  const uploads = dataResources(uploadsBody).filter(
    (resource) =>
      resource.type === 'buildUploads' &&
      stringAttribute(resource, 'cfBundleShortVersionString') === marketingVersion &&
      stringAttribute(resource, 'cfBundleVersion') === buildNumber &&
      stringAttribute(resource, 'platform') === 'IOS'
  );
  if (uploads.length !== 1) {
    throw new Error(
      `expected one exact iOS build upload for ${bundleId} ${marketingVersion} (${buildNumber}), found ${uploads.length}`
    );
  }
  const upload = uploads[0];
  if (upload === undefined) throw new Error('exact App Store Connect build upload is missing');
  const uploadId = upload.id;
  if (uploadId === undefined) throw new Error('exact App Store Connect build upload has no id');
  if (stringAttribute(upload, 'state') !== 'COMPLETE') {
    throw new Error(
      `App Store Connect build upload ${uploadId} is not complete; duplicate was not proven safe`
    );
  }

  return {
    scheme: parsedScheme,
    bundleId,
    marketingVersion,
    buildNumber,
    sourceCommit,
    uploadId,
  };
}

/**
 * @param {readonly string[]} argv
 * @param {string} name
 * @returns {string}
 */
function argument(argv, name) {
  const index = argv.indexOf(name);
  const value = argv[index + 1];
  if (index < 0 || value === undefined || value.startsWith('--')) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const scheme = parseScheme(argument(argv, '--scheme'));
  const bundleId = argument(argv, '--bundle-id');
  const marketingVersion = argument(argv, '--marketing-version');
  const buildNumber = argument(argv, '--build-number');
  const sourceCommit = argument(argv, '--source-commit');
  const sourceCommitCount = argument(argv, '--source-commit-count');
  const exportLog = argument(argv, '--export-log');
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) {
    throw new Error('ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH are required');
  }
  const token = createToken({
    keyId: ASC_KEY_ID,
    issuerId: ASC_ISSUER_ID,
    privateKey: readFileSync(ASC_KEY_PATH, 'utf8'),
  });
  const verified = await verifyDuplicateBuild({
    scheme,
    bundleId,
    marketingVersion,
    buildNumber,
    sourceCommit,
    sourceCommitCount,
    exportOutput: readFileSync(exportLog, 'utf8'),
    token,
  });
  console.log(
    `testflight: duplicate response verified for ${verified.scheme} ${verified.marketingVersion} (${verified.buildNumber}) from ${verified.sourceCommit.slice(0, 7)}`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
