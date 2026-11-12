import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  bundleIdForScheme,
  isKnownDuplicateBuildResponse,
  verifyDuplicateBuild,
} from '../testflight-upload.mjs';

const duplicateResponse =
  'error: The bundle version must be higher than the previously uploaded version';
const sourceCommit = '0123456789abcdef0123456789abcdef01234567';
const marketingVersion = '2026.9.26';
const buildNumber = '3492';
const testflightScript = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'clients',
    'ios',
    'scripts',
    'testflight.sh'
  ),
  'utf8'
);
const testflightWorkflow = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    '.github',
    'workflows',
    'ios-testflight.yml'
  ),
  'utf8'
);

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function appResponse(bundleId: string, id: string) {
  return response({
    data: [{ type: 'apps', id, attributes: { bundleId } }],
  });
}

function uploadResponse({
  uploadId,
  state = 'COMPLETE',
  platform = 'IOS',
  version = marketingVersion,
  number = buildNumber,
}: {
  uploadId: string;
  state?: string;
  platform?: string;
  version?: string;
  number?: string;
}) {
  return response({
    data: [
      {
        type: 'buildUploads',
        id: uploadId,
        attributes: {
          cfBundleShortVersionString: version,
          cfBundleVersion: number,
          platform,
          state,
        },
      },
    ],
  });
}

function input(
  scheme: 'Pops' | 'PopsPlayground' | 'PopsTrips',
  request: typeof fetch,
  overrides: Partial<Parameters<typeof verifyDuplicateBuild>[0]> = {}
) {
  return {
    scheme,
    bundleId: bundleIdForScheme(scheme),
    marketingVersion,
    buildNumber,
    sourceCommit,
    sourceCommitCount: buildNumber,
    exportOutput: duplicateResponse,
    token: 'test-token',
    request,
    ...overrides,
  };
}

describe('TestFlight duplicate upload verification', () => {
  it.each([
    ['Pops', 'com.knoxiolabs.pops'],
    ['PopsPlayground', 'com.knoxiolabs.pops.playground'],
    ['PopsTrips', 'com.knoxiolabs.pops.trips'],
  ] as const)('verifies exact upload identity for %s', async (scheme, bundleId) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(appResponse(bundleId, `${scheme}-app`))
      .mockResolvedValueOnce(uploadResponse({ uploadId: `${scheme}-upload` }));

    await expect(verifyDuplicateBuild(input(scheme, request))).resolves.toMatchObject({
      uploadId: `${scheme}-upload`,
      scheme,
      bundleId,
    });
    const uploadRequest = request.mock.calls[1]?.[0];
    if (uploadRequest === undefined) throw new Error('missing build upload request');
    const uploadUrl = new URL(uploadRequest.toString());
    expect(uploadUrl.pathname).toBe(`/v1/apps/${scheme}-app/buildUploads`);
    expect(uploadUrl.searchParams.get('filter[cfBundleShortVersionString]')).toBe(marketingVersion);
    expect(uploadUrl.searchParams.get('filter[cfBundleVersion]')).toBe(buildNumber);
    expect(uploadUrl.searchParams.get('filter[platform]')).toBe('IOS');
  });

  it('requires the exact scheme-to-bundle identity before querying Apple', async () => {
    const request = vi.fn<typeof fetch>();

    await expect(
      verifyDuplicateBuild(
        input('Pops', request, { bundleId: bundleIdForScheme('PopsPlayground') })
      )
    ).rejects.toThrow('does not produce bundle identifier');
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps a genuine duplicate/version conflict red when Apple has no exact upload', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(appResponse(bundleIdForScheme('Pops'), 'pops-app'))
      .mockResolvedValueOnce(
        uploadResponse({
          uploadId: 'wrong-version',
          version: '2026.9.25',
        })
      );

    await expect(verifyDuplicateBuild(input('Pops', request))).rejects.toThrow(
      'expected one exact iOS build upload'
    );
  });

  it.each(['PROCESSING', 'FAILED'])(
    'keeps an incomplete duplicate response red when upload state is %s',
    async (state) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(appResponse(bundleIdForScheme('Pops'), 'pops-app'))
        .mockResolvedValueOnce(uploadResponse({ uploadId: 'upload', state }));

      await expect(verifyDuplicateBuild(input('Pops', request))).rejects.toThrow('is not complete');
    }
  );

  it('requires the build number to prove the full source commit identity', () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(appResponse(bundleIdForScheme('Pops'), 'pops-app'))
      .mockResolvedValueOnce(uploadResponse({ uploadId: 'upload' }));

    return expect(
      verifyDuplicateBuild(input('Pops', request, { sourceCommitCount: '3491' }))
    ).rejects.toThrow('does not match build number');
  });

  it('does not query Apple for a different export failure', async () => {
    const request = vi.fn<typeof fetch>();

    await expect(
      verifyDuplicateBuild(input('Pops', request, { exportOutput: 'Redundant Binary Upload' }))
    ).rejects.toThrow('was not the known duplicate-build response');
    expect(request).not.toHaveBeenCalled();
  });

  it('recognises only the exact duplicate-build response', () => {
    expect(isKnownDuplicateBuildResponse(duplicateResponse)).toBe(true);
    expect(isKnownDuplicateBuildResponse('Redundant Binary Upload')).toBe(false);
    expect(isKnownDuplicateBuildResponse('The bundle version is invalid')).toBe(false);
  });

  it('routes export failures through the guarded verifier', () => {
    expect(testflightScript).toContain('testflight-upload.mjs');
    expect(testflightScript).toContain('--export-log');
  });

  it('selects PopsTrips for the shipped upload workflow', () => {
    expect(testflightScript).toContain('PopsTrips) shipped_bundle_id=com.knoxiolabs.pops.trips');
    expect(testflightWorkflow).toContain('mise run release:testflight PopsTrips');
  });
});
