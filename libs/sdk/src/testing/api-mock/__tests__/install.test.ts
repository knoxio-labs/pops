import { describe, expect, it, vi } from 'vitest';

import { installApiMock, type MockRequest } from '../install.js';

function fakeTarget() {
  const original = vi.fn<typeof globalThis.fetch>(async () => new Response('passed through'));
  return { target: { fetch: original }, original };
}

describe('installApiMock', () => {
  it('answers a declared operation from its handler, with params, query and body', async () => {
    const { target } = fakeTarget();
    const seen: MockRequest[] = [];
    installApiMock({
      target,
      baseUrl: '/finance-api',
      handlers: {
        'POST /accounts/{id}/checkpoints': (request) => {
          seen.push(request);
          return { status: 201, body: { ok: true } };
        },
      },
    });

    const response = await target.fetch('/finance-api/accounts/acc_1/checkpoints?dry=1', {
      method: 'post',
      body: JSON.stringify({ balance: 10 }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.path).toBe('/accounts/acc_1/checkpoints');
    expect(seen[0]?.params).toEqual({ id: 'acc_1' });
    expect(seen[0]?.query.get('dry')).toBe('1');
    expect(seen[0]?.body).toEqual({ balance: 10 });
  });

  it('reads method and body off a Request as well as off init', async () => {
    const { target } = fakeTarget();
    const handler = vi.fn((_request: MockRequest) => ({ body: [] }));
    installApiMock({ target, baseUrl: '/api', handlers: { 'PUT /things': handler } });

    await target.fetch(
      new Request('http://host.invalid/api/things', { method: 'PUT', body: '{"a":1}' })
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0].body).toEqual({ a: 1 });
  });

  it('hands an unparseable body to the handler as undefined', async () => {
    const { target } = fakeTarget();
    const handler = vi.fn((_request: MockRequest) => ({}));
    installApiMock({ target, baseUrl: '/api', handlers: { 'POST /things': handler } });

    const response = await target.fetch('/api/things', { method: 'POST', body: '{not json' });

    expect(handler.mock.calls[0]?.[0].body).toBeUndefined();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('passes anything outside the base path through, including a lookalike prefix', async () => {
    const { target, original } = fakeTarget();
    installApiMock({ target, baseUrl: '/api', handlers: {} });

    expect(await (await target.fetch('/assets/app.js')).text()).toBe('passed through');
    expect(await (await target.fetch('/api-other/things')).text()).toBe('passed through');
    expect(original).toHaveBeenCalledTimes(2);
  });

  it('answers an undeclared operation with a 501 and reports it', async () => {
    const { target, original } = fakeTarget();
    const onUnhandled = vi.fn();
    installApiMock({
      target,
      baseUrl: '/api',
      handlers: { 'GET /things': () => ({ body: [] }) },
      onUnhandled,
    });

    const response = await target.fetch('/api/things', { method: 'DELETE' });

    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ code: 'MOCK_NOT_IMPLEMENTED' });
    expect(onUnhandled).toHaveBeenCalledWith('DELETE', '/things');
    expect(original).not.toHaveBeenCalled();
  });

  it('composes: each install answers its own prefix and passes the rest down', async () => {
    const { target, original } = fakeTarget();
    const restoreA = installApiMock({
      target,
      baseUrl: '/a-api',
      handlers: { 'GET /x': () => ({ body: 'a' }) },
    });
    const restoreB = installApiMock({
      target,
      baseUrl: '/b-api',
      handlers: { 'GET /x': () => ({ body: 'b' }) },
    });

    expect(await (await target.fetch('/a-api/x')).json()).toBe('a');
    expect(await (await target.fetch('/b-api/x')).json()).toBe('b');
    expect(original).not.toHaveBeenCalled();

    restoreB();
    restoreA();
    expect(target.fetch).toBe(original);
  });

  it('restores the previous fetch itself, and a second restore is a no-op', () => {
    const { target, original } = fakeTarget();
    const restore = installApiMock({ target, baseUrl: '/api', handlers: {} });
    expect(target.fetch).not.toBe(original);

    restore();
    expect(target.fetch).toBe(original);

    const replacement = vi.fn<typeof globalThis.fetch>();
    target.fetch = replacement;
    restore();
    expect(target.fetch).toBe(replacement);
  });
});
