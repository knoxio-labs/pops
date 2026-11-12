import { expect, it, vi } from 'vitest';

import { createClient } from '../trips-api/client';
import { readOwner } from './read-owner';

it('returns only the result from its unchanged owning origin', async () => {
  const client = createClient({ baseUrl: 'https://first.invalid' });
  const value = { value: 'owner source' };
  expect(await readOwner(client, 'https://first.invalid', async () => value)).toBe(value);
});

it('rejects changed ownership before dispatching an optional-context loader', async () => {
  const client = createClient({ baseUrl: 'https://second.invalid' });
  const load = vi.fn(async () => 'foreign');
  await expect(readOwner(client, 'https://first.invalid', load)).rejects.toThrow(
    'Trips connection changed'
  );
  expect(load).not.toHaveBeenCalled();
});

it('rejects a delivered value after the loader changes the effective owner', async () => {
  const client = createClient({ baseUrl: 'https://first.invalid' });
  await expect(
    readOwner(client, 'https://first.invalid', async () => {
      client.setConfig({ baseUrl: 'https://second.invalid' });
      return 'foreign';
    })
  ).rejects.toThrow('Trips connection changed');
});
