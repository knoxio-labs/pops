import { generateKeyPairSync, verify } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  createToken,
  disposableDevelopmentCertificates,
  pruneCertificates,
} from '../prune-testflight-certificates.mjs';

const certificate = (id: string, displayName: string, certificateType: string) => ({
  id,
  type: 'certificates' as const,
  attributes: { displayName, certificateType },
});

describe('TestFlight certificate pruning', () => {
  it('selects only exact API-created development certificates', () => {
    const disposable = disposableDevelopmentCertificates([
      certificate('ios-dev', 'Created via API', 'IOS_DEVELOPMENT'),
      certificate('dev', 'Created via API', 'DEVELOPMENT'),
      certificate('distribution', 'Created via API', 'IOS_DISTRIBUTION'),
      certificate('human', 'Joao MacBook', 'IOS_DEVELOPMENT'),
    ]);

    expect(disposable.map(({ id }) => id)).toEqual(['ios-dev', 'dev']);
  });

  it('refuses an unexpectedly broad revocation set', () => {
    const certificates = Array.from({ length: 11 }, (_, index) =>
      certificate(String(index), 'Created via API', 'IOS_DEVELOPMENT')
    );

    expect(() => disposableDevelopmentCertificates(certificates)).toThrow(
      'refusing to revoke 11 certificates'
    );
  });

  it('creates a valid short-lived ES256 App Store Connect token', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const token = createToken({
      keyId: 'key-id',
      issuerId: 'issuer-id',
      privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      now: 1000,
    });
    const tokenParts = token.split('.');
    expect(tokenParts).toHaveLength(3);
    const [header, payload, signature] = tokenParts;
    if (header === undefined || payload === undefined || signature === undefined) {
      throw new Error('token did not contain three parts');
    }

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'key-id',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      iss: 'issuer-id',
      iat: 1000,
      exp: 1120,
      aud: 'appstoreconnect-v1',
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        {
          key: publicKey,
          dsaEncoding: 'ieee-p1363',
        },
        Buffer.from(signature, 'base64url')
      )
    ).toBe(true);
  });

  it('revokes every selected certificate and nothing else', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              certificate('disposable', 'Created via API', 'IOS_DEVELOPMENT'),
              certificate('distribution', 'Created via API', 'IOS_DISTRIBUTION'),
              certificate('human', 'Joao MacBook', 'IOS_DEVELOPMENT'),
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(pruneCertificates({ token: 'token', request })).resolves.toBe(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(String(request.mock.calls[1]?.[0])).toBe(
      'https://api.appstoreconnect.apple.com/v1/certificates/disposable'
    );
    expect(request.mock.calls[1]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('fails closed when listing or revocation is rejected', async () => {
    const listFailure = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 403 }));
    await expect(pruneCertificates({ token: 'token', request: listFailure })).rejects.toThrow(
      'certificate list failed with HTTP 403'
    );

    const revokeFailure = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [certificate('one', 'Created via API', 'IOS_DEVELOPMENT')] }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 409 }));
    await expect(pruneCertificates({ token: 'token', request: revokeFailure })).rejects.toThrow(
      'certificate revocation failed with HTTP 409'
    );
  });
});
