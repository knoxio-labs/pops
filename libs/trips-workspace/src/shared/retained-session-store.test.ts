import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { createClient } from '../trips-api/client';
import { client as defaultClient } from '../trips-api/client.gen';
import { RetainedSessionStore, SourceSessionView } from './retained-session-store';

describe('Retained source owner boundaries', () => {
  it('retains the exact owner independently of query-cache removal', () => {
    const store = new RetainedSessionStore<{ draft: string }>();
    const cache = new QueryClient();
    const identity = {
      client: createClient({ baseUrl: 'https://owner.example' }),
      tripId: 7,
      kind: 'stay',
      sourceId: 13,
    };
    const first = store.retain(cache, identity, () => ({ draft: 'Unsaved' }));
    cache.clear();
    expect(store.retain(cache, { ...identity }, () => ({ draft: 'Replacement' }))).toBe(first);
    expect(first.session.draft).toBe('Unsaved');
  });

  it('isolates every declared authority boundary and returns the original session on return', () => {
    const store = new RetainedSessionStore<object>();
    const cache = new QueryClient();
    const client = createClient({ baseUrl: 'https://owner.example' });
    const identity = { client, tripId: 7, kind: 'stay', sourceId: 13 };
    const first = store.retain(cache, identity, () => ({}));
    for (const other of [
      { ...identity, client: createClient({ baseUrl: 'https://owner.example' }) },
      { ...identity, tripId: 8 },
      { ...identity, kind: 'event' },
      { ...identity, sourceId: 14 },
    ])
      expect(store.retain(cache, other, () => ({}))).not.toBe(first);
    expect(store.retain(new QueryClient(), identity, () => ({}))).not.toBe(first);
    client.setConfig({ baseUrl: 'https://other.example' });
    expect(store.retain(cache, identity, () => ({}))).not.toBe(first);
    client.setConfig({ baseUrl: 'https://owner.example' });
    expect(store.retain(cache, identity, () => ({}))).toBe(first);
  });

  it('resolves the actual default client and observes its mutable configuration', () => {
    const previous = defaultClient.getConfig().baseUrl;
    const store = new RetainedSessionStore<object>();
    const cache = new QueryClient();
    const identity = { tripId: 7, kind: 'stay', sourceId: 13 };
    try {
      const first = store.retain(cache, identity, () => ({}));
      expect(first.owner.client).toBe(defaultClient);
      expect(store.retain(cache, { ...identity, client: defaultClient }, () => ({}))).toBe(first);
      defaultClient.setConfig({ baseUrl: 'https://other.example' });
      expect(store.retain(cache, identity, () => ({}))).not.toBe(first);
    } finally {
      defaultClient.setConfig({ baseUrl: previous });
    }
  });

  it('grants independent view leases and rejects configuration changes without a render', () => {
    const store = new RetainedSessionStore<object>();
    const client = createClient({ baseUrl: 'https://owner.example' });
    const retained = store.retain(
      new QueryClient(),
      { client, tripId: 7, kind: 'stay', sourceId: 13 },
      () => ({})
    );
    const first = new SourceSessionView(retained.owner);
    const second = new SourceSessionView(retained.owner);
    expect(() => first.assertCurrent()).toThrow();
    first.activate();
    second.activate();
    first.deactivate();
    expect(() => first.assertCurrent()).toThrow();
    expect(() => second.assertCurrent()).not.toThrow();
    client.setConfig({ baseUrl: 'https://other.example' });
    expect(() => second.assertCurrent()).toThrow();
  });
});
