import { expect, it, vi } from 'vitest';

import { ContactError } from '../errors';
import { ContactChooserSession } from './ContactChooserSession';

import type { Entity } from '../contacts-api/types.gen';
import type { ContactCreationGateway } from './api';

const entity: Entity = {
  id: 'known',
  name: '界',
  type: 'bank',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
};
function gateway(): ContactCreationGateway {
  return {
    catalogue: vi.fn(),
    search: vi.fn(),
    load: vi.fn(),
    update: vi.fn(),
    addPoint: vi.fn(),
    addAddress: vi.fn(),
    create: vi.fn().mockResolvedValue(entity),
    resolve: vi.fn().mockResolvedValue({
      entity,
      reference: { canonicalId: entity.id, uri: 'pops:contacts/contact/known' },
    }),
  };
}

it('retains a known create without subscribers and retries only resolution after remount', async () => {
  const session = new ContactChooserSession();
  const api = gateway();
  api.resolve = vi
    .fn()
    .mockRejectedValueOnce(new ContactError('network', 'contacts.network'))
    .mockResolvedValue({ entity });
  session.start('界');
  session.setType('bank');
  const listener = vi.fn();
  const unmount = session.subscribe(listener);
  unmount();
  expect(await session.submit(api, 'bank')).toBeNull();
  expect(session.snapshot().created).toEqual(entity);
  expect(listener).not.toHaveBeenCalled();
  const remounted = vi.fn();
  session.subscribe(remounted);
  await session.submit(api, 'bank');
  expect(api.create).toHaveBeenCalledOnce();
  expect(api.resolve).toHaveBeenCalledTimes(2);
  expect(remounted).toHaveBeenCalled();
});

it('fences uncertain creates across view lifetimes and ignores edits to that intent', async () => {
  const session = new ContactChooserSession();
  const api = gateway();
  api.create = vi.fn().mockRejectedValue(new ContactError('network', 'contacts.network'));
  session.start('界');
  session.setType('bank');
  await session.submit(api, 'bank');
  session.start('replacement');
  session.setName('replacement');
  session.setType('person');
  await session.submit(api, 'person');
  expect(session.snapshot()).toMatchObject({ name: '界', selectedType: 'bank', uncertain: true });
  expect(api.create).toHaveBeenCalledOnce();
  expect(api.resolve).not.toHaveBeenCalled();
});

it('serializes concurrent submissions before a create promise resolves', async () => {
  const session = new ContactChooserSession();
  const api = gateway();
  let finish: (entity: Entity) => void = () => {
    throw new Error('Not started');
  };
  api.create = vi.fn(
    () =>
      new Promise<Entity>((resolve) => {
        finish = resolve;
      })
  );
  session.start('界');
  const pending = session.submit(api, 'bank');
  expect(await session.submit(api, 'bank')).toBeNull();
  finish(entity);
  await pending;
  expect(api.create).toHaveBeenCalledOnce();
});
