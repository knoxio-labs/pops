import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerDesignPillar } from '../register.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerDesignPillar', () => {
  it('returns the handle when the registry accepts the manifest', async () => {
    const handle = { stop: () => Promise.resolve() };
    const bootstrap = vi.fn().mockResolvedValue(handle);

    await expect(registerDesignPillar('1.2.3', 'http://design-api:3015', bootstrap)).resolves.toBe(
      handle
    );
  });

  it('registers the running version at the advertised origin', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ stop: () => Promise.resolve() });

    await registerDesignPillar('1.2.3', 'http://design-api:3015', bootstrap);

    const [input] = bootstrap.mock.calls[0] ?? [];
    expect(input?.baseUrl).toBe('http://design-api:3015');
    expect(input?.manifest.pillar).toBe('design');
    expect(input?.manifest.version).toBe('1.2.3');
  });

  it('resolves undefined instead of rejecting when the registry is unreachable', async () => {
    const bootstrap = vi.fn().mockRejectedValue(new Error('ECONNREFUSED registry-api:3001'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // The assertion that matters: this runs after `listen`, so a rejection
    // escaping here is unhandled and kills a process that is already serving.
    await expect(
      registerDesignPillar('1.2.3', 'http://design-api:3015', bootstrap)
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledOnce();
  });

  it('says which pillar failed and does not swallow the cause', async () => {
    const cause = new Error('ECONNREFUSED registry-api:3001');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await registerDesignPillar('1.2.3', 'http://design-api:3015', vi.fn().mockRejectedValue(cause));

    expect(logged).toHaveBeenCalledWith(expect.stringContaining('[design-api]'), cause);
  });
});
