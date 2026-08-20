import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import { type InferenceRecord } from '../record-schema.js';
import { AiUsageRecordRefusedError, createEnvReportSink } from '../report-sink.js';

const record: InferenceRecord = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  operation: 'categorize',
  domain: 'finance',
  inputTokens: 10,
  outputTokens: 5,
  costUsd: 0.001,
  latencyMs: 120,
  status: 'success',
  cached: false,
};

const okFetch = (): Mock<typeof fetch> =>
  vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })));

afterEach(() => {
  delete process.env['AI_API_URL'];
  delete process.env['POPS_API_URL'];
  delete process.env['POPS_INTERNAL_CREDENTIAL'];
});

describe('createEnvReportSink', () => {
  it('POSTs the record to /ai-usage/record with the per-caller credential header', async () => {
    const fetchImpl = okFetch();
    await createEnvReportSink({
      baseUrl: 'http://ai-api:3008',
      credential: 'finance.secret',
      fetchImpl,
    })(record);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://ai-api:3008/ai-usage/record');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('x-pops-internal-credential')).toBe('finance.secret');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      provider: 'anthropic',
      domain: 'finance',
    });
  });

  it('is a no-op when no base URL resolves', async () => {
    const fetchImpl = okFetch();
    await createEnvReportSink({ fetchImpl })(record);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never throws when the transport rejects (best-effort contract)', async () => {
    const onError = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new Error('ECONNREFUSED')));
    await expect(
      createEnvReportSink({ baseUrl: 'http://ai-api:3008', fetchImpl, onError })(record)
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('prefers AI_API_URL over a self-pointing POPS_API_URL', async () => {
    process.env['AI_API_URL'] = 'http://ai-api:3008';
    process.env['POPS_API_URL'] = 'http://food-api:3005';
    const fetchImpl = okFetch();
    await createEnvReportSink({ fetchImpl })(record);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://ai-api:3008/ai-usage/record');
  });

  it('falls back to POPS_API_URL when AI_API_URL is unset', async () => {
    process.env['POPS_API_URL'] = 'http://self:3005';
    const fetchImpl = okFetch();
    await createEnvReportSink({ fetchImpl })(record);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://self:3005/ai-usage/record');
  });

  it('omits the credential header when none is configured', async () => {
    const fetchImpl = okFetch();
    await createEnvReportSink({ baseUrl: 'http://ai-api:3008/', fetchImpl })(record);
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get('x-pops-internal-credential')).toBeNull();
    // trailing slash on the base URL is trimmed, not doubled
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://ai-api:3008/ai-usage/record');
  });

  it('reports a refused record instead of dropping it, naming the status', async () => {
    const onError = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 403 }))
    );

    await expect(
      createEnvReportSink({
        baseUrl: 'http://ai-api:3008',
        credential: 'purchases.secret',
        fetchImpl,
        onError,
      })(record)
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledOnce();
    const reported = onError.mock.calls[0]?.[0];
    expect(reported).toBeInstanceOf(Error);
    const message = reported instanceof Error ? reported.message : '';
    expect(message).toContain('403');
    // The caller half is what an operator needs; the secret half is not.
    expect(message).toContain("'purchases'");
    expect(message).not.toContain('purchases.secret');
  });

  it('says so when the refused record carried no credential at all', async () => {
    const onError = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 403 }))
    );

    await createEnvReportSink({ baseUrl: 'http://ai-api:3008', fetchImpl, onError })(record);

    const reported = onError.mock.calls[0]?.[0];
    expect(reported instanceof Error ? reported.message : '').toContain(
      'no per-caller credential was presented'
    );
  });

  it('reports a refusal as a distinguishable error carrying the status', async () => {
    const onError = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 401 }))
    );

    await createEnvReportSink({
      baseUrl: 'http://ai-api:3008',
      credential: 'purchases.secret',
      fetchImpl,
      onError,
    })(record);

    const reported: unknown = onError.mock.calls[0]?.[0];
    expect(reported).toBeInstanceOf(AiUsageRecordRefusedError);
    expect(reported instanceof AiUsageRecordRefusedError ? reported.status : undefined).toBe(401);
  });

  it('does not dress a transport failure up as a refusal', async () => {
    const onError = vi.fn();
    const thrown = new Error('ECONNREFUSED');
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(thrown));

    await createEnvReportSink({
      baseUrl: 'http://ai-api:3008',
      credential: 'purchases.secret',
      fetchImpl,
      onError,
    })(record);

    const reported: unknown = onError.mock.calls[0]?.[0];
    expect(reported).toBe(thrown);
    expect(reported).not.toBeInstanceOf(AiUsageRecordRefusedError);
  });

  it('says a credential without a caller half is malformed rather than absent, and never echoes it', async () => {
    const onError = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 403 }))
    );

    // The likeliest provisioning slip: the bare secret written where the whole
    // `name.secret` credential belongs.
    await createEnvReportSink({
      baseUrl: 'http://ai-api:3008',
      credential: 'bare-secret-with-no-caller',
      fetchImpl,
      onError,
    })(record);

    const reported: unknown = onError.mock.calls[0]?.[0];
    const message = reported instanceof Error ? reported.message : '';
    expect(message).toContain("not in 'name.secret' form");
    expect(message).not.toContain('no per-caller credential was presented');
    expect(message).not.toContain('bare-secret-with-no-caller');
  });

  it('treats a leading-dot credential the same way, rather than naming an empty caller', async () => {
    const onError = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 403 }))
    );

    await createEnvReportSink({
      baseUrl: 'http://ai-api:3008',
      credential: '.secret',
      fetchImpl,
      onError,
    })(record);

    const reported: unknown = onError.mock.calls[0]?.[0];
    const message = reported instanceof Error ? reported.message : '';
    expect(message).toContain("not in 'name.secret' form");
    expect(message).not.toContain("presented as ''");
  });

  it('stays quiet on a 2xx', async () => {
    const onError = vi.fn();
    await createEnvReportSink({ baseUrl: 'http://ai-api:3008', fetchImpl: okFetch(), onError })(
      record
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('reads the credential from POPS_INTERNAL_CREDENTIAL when not passed explicitly', async () => {
    process.env['POPS_INTERNAL_CREDENTIAL'] = 'cerebrum.env-secret';
    const fetchImpl = okFetch();
    await createEnvReportSink({ baseUrl: 'http://ai-api:3008', fetchImpl })(record);
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get('x-pops-internal-credential')).toBe(
      'cerebrum.env-secret'
    );
  });
});
