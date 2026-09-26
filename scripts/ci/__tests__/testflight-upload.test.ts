import { describe, expect, it, vi } from 'vitest';

import {
  assertSourceIdentity,
  bundleIdForScheme,
  isKnownDuplicateBuildResponse,
  verifyDuplicateBuild,
} from '../testflight-upload.mjs';

const duplicateResponse =
  'error: The bundle version must be higher than the previously uploaded version';
const sourceCommit = '0123456789abcdef0123456789abcdef01234567';
const marketingVersion = '2026.9.26';
const buildNumber = '3492';

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
  scheme: 'Pops' | 'PopsPlayground',
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
  it('accepts a split-success retry for both exact app uploads', async () => {
    const popsRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(appResponse(bundleIdForScheme('Pops'), 'pops-app'))
      .mockResolvedValueOnce(uploadResponse({ uploadId: 'pops-upload' }));
    const playgroundRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(appResponse(bundleIdForScheme('PopsPlayground'), 'playground-app'))
      .mockResolvedValueOnce(
        uploadResponse({
          uploadId: 'playground-upload',
        })
      );

    await expect(verifyDuplicateBuild(input('Pops', popsRequest))).resolves.toMatchObject({
      uploadId: 'pops-upload',
      scheme: 'Pops',
    });
    const uploadRequest = popsRequest.mock.calls[1]?.[0];
    if (uploadRequest === undefined) throw new Error('missing build upload request');
    const uploadUrl = new URL(uploadRequest.toString());
    expect(uploadUrl.pathname).toBe('/v1/apps/pops-app/buildUploads');
    expect(uploadUrl.searchParams.get('filter[cfBundleShortVersionString]')).toBe(marketingVersion);
    expect(uploadUrl.searchParams.get('filter[cfBundleVersion]')).toBe(buildNumber);
    expect(uploadUrl.searchParams.get('filter[platform]')).toBe('IOS');
    await expect(
      verifyDuplicateBuild(input('PopsPlayground', playgroundRequest))
    ).resolves.toMatchObject({
      uploadId: 'playground-upload',
      scheme: 'PopsPlayground',
    });
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
    expect(() =>
      assertSourceIdentity({
        sourceCommit,
        sourceCommitCount: '3491',
        buildNumber,
      })
    ).toThrow('does not match build number');
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
});
