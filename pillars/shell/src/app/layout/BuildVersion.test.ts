import { render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BuildVersion, shortVersion } from './BuildVersion';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BuildVersion', () => {
  it('reads the registry version through its namespaced API route', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ version: 'a0123456789' }), {
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchStub);

    const { container } = render(createElement(BuildVersion));

    await waitFor(() => expect(fetchStub).toHaveBeenCalledWith('/registry-api/health'));
    await waitFor(() => expect(container.textContent).toContain('a0123456'));
  });
});

describe('shortVersion', () => {
  // The topbar showed two full 40-char SHAs side by side and exploded the
  // header. We keep the one-letter prefix that distinguishes the frontend
  // ('f') and api ('a') builds, then truncate the SHA to 7 chars.
  it('truncates a 40-char frontend SHA to prefix + 7 chars', () => {
    expect(shortVersion('f0f8b7ae0bb0fad395a43ba9b3309740a50db8080')).toBe('f0f8b7ae');
  });

  it('truncates a 40-char api SHA the same way', () => {
    expect(shortVersion('a0f8b7ae0bb0fad395a43ba9b3309740a50db8080')).toBe('a0f8b7ae');
  });

  it("leaves 'dev' alone — it's already short and humans recognise it", () => {
    expect(shortVersion('dev')).toBe('dev');
  });

  it('returns null for empty / missing input', () => {
    expect(shortVersion(null)).toBeNull();
    expect(shortVersion(undefined)).toBeNull();
    expect(shortVersion('')).toBeNull();
  });

  it('truncates an unprefixed long value to 8 chars rather than letting it explode', () => {
    expect(shortVersion('1234567890abcdef')).toBe('12345678');
  });

  it('leaves short non-prefixed strings alone', () => {
    expect(shortVersion('v1.2.3')).toBe('v1.2.3');
  });
});
