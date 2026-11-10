import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArrangementResponsibilityField, ArrangementResponsibilityProvider } from '../index';
import { routeJson } from '../route/test-utils';
import { createClient } from '../trips-api/client';
import { client as defaultClient } from '../trips-api/client.gen';
import { ResponsibilityContactChooser } from './ResponsibilityContactChooser';
import { labels } from './test-utils';

import type { ContactChooserIntent, ContactChooserMountProps } from '@pops/pillar-sdk';

import type { ArrangementResponsibilityContext } from './responsibility-context';
import type { ArrangementTarget } from './types';

const selection = {
  name: 'Actual owner selection',
  reference: { canonicalId: 'issued', uri: 'pops:contacts/contact/issued' },
};
afterEach(cleanup);
function retainedPicker() {
  const mounts: ContactChooserMountProps[] = [];
  const intent: ContactChooserIntent = {
    Chooser: (props) => {
      mounts.push(props);
      return <button onClick={() => props.onSelect(selection)}>Owner choice</button>;
    },
  };
  return { mounts, intent };
}

describe('Responsibility chooser source context', () => {
  it('cannot retarget an open picker to a cached source, including saved callbacks after returning', async () => {
    const writes: { path: string; body: unknown }[] = [];
    const client = createClient({
      baseUrl: 'http://responsibility.test',
      fetch: async (input, init) => {
        const request = new Request(input, init);
        const path = new URL(request.url).pathname;
        const targetId = Number(path.split('/').at(-1));
        if (request.method === 'PUT') writes.push({ path, body: await request.json() });
        return routeJson({
          tripId: 7,
          targetKind: 'stay',
          targetId,
          responsibility:
            request.method === 'PUT' ? { kind: 'contact', uri: selection.reference.uri } : null,
          revision: request.method === 'PUT' ? 5 : 4,
        });
      },
    });
    const picker = retainedPicker();
    const getIntent = vi.fn(() => picker.intent);
    const identity = { tripId: 7, client, labels, contactChooserIntent: getIntent };
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const field = (targetId: number) => (
      <QueryClientProvider client={cache}>
        <ArrangementResponsibilityProvider identity={identity}>
          <ArrangementResponsibilityField
            identity={identity}
            target={{ targetKind: 'stay', targetId }}
          />
        </ArrangementResponsibilityProvider>
      </QueryClientProvider>
    );
    const mounted = render(field(62));
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole('button', { name: labels.self })).toBeEnabled());
    mounted.rerender(field(61));
    await waitFor(() => expect(screen.getByRole('button', { name: labels.self })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: labels.chooseContact }));
    const original = picker.mounts.at(-1);
    mounted.rerender(field(62));
    await waitFor(() => expect(screen.getByRole('button', { name: labels.self })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Owner choice' })).not.toBeInTheDocument();
    original?.onSelect(selection);
    expect(writes).toEqual([]);
    mounted.rerender(field(61));
    await waitFor(() => expect(screen.getByRole('button', { name: labels.self })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: labels.chooseContact }));
    original?.onSelect(selection);
    expect(writes).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Owner choice' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes).toEqual([
      {
        path: '/trips/7/responsibilities/stay/61',
        body: {
          expectedRevision: 4,
          responsibility: { kind: 'contact', uri: selection.reference.uri },
        },
      },
    ]);
    expect(getIntent.mock.calls).toEqual([
      [{ targetKind: 'stay', targetId: 61 }],
      [{ targetKind: 'stay', targetId: 61 }],
    ]);
  });

  it.each(['client', 'origin', 'trip', 'kind', 'id'] as const)(
    'invalidates the original mounted view across a %s switch and ABA return',
    async (changed) => {
      const client = createClient({ baseUrl: 'http://responsibility.test' });
      const picker = retainedPicker();
      const select = vi.fn();
      const identity: ArrangementResponsibilityContext = {
        tripId: 7,
        client,
        labels,
        contactChooserIntent: () => picker.intent,
      };
      const target: ArrangementTarget = { targetKind: 'rental', targetId: 61 };
      const field = (owner = identity, source = target) => (
        <ResponsibilityContactChooser
          identity={owner}
          target={source}
          disabled={false}
          select={select}
        />
      );
      const mounted = render(field());
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: labels.chooseContact }));
      const original = picker.mounts.at(-1);
      let nextIdentity = identity;
      let nextTarget = target;
      if (changed === 'client')
        nextIdentity = {
          ...identity,
          client: createClient({ baseUrl: 'http://responsibility.test' }),
        };
      if (changed === 'trip') nextIdentity = { ...identity, tripId: 8 };
      if (changed === 'kind') nextTarget = { ...target, targetKind: 'stay' };
      if (changed === 'id') nextTarget = { ...target, targetId: 62 };
      if (changed === 'origin') client.setConfig({ baseUrl: 'http://other.test' });
      mounted.rerender(field(nextIdentity, nextTarget));
      original?.onOpenChange(true);
      original?.onSelect(selection);
      expect(select).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Owner choice' })).not.toBeInTheDocument();
      client.setConfig({ baseUrl: 'http://responsibility.test' });
      mounted.rerender(field());
      await user.click(screen.getByRole('button', { name: labels.chooseContact }));
      original?.onSelect(selection);
      expect(select).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Owner choice' }));
      expect(select).toHaveBeenCalledExactlyOnceWith(selection.reference.uri, picker.intent);
    }
  );

  it('does not reactivate a cancelled callback when the same opaque intent is explicitly reopened', async () => {
    const picker = retainedPicker();
    const select = vi.fn();
    const identity = { tripId: 7, labels, contactChooserIntent: () => picker.intent };
    render(
      <ResponsibilityContactChooser
        identity={identity}
        target={{ targetKind: 'stay', targetId: 61 }}
        disabled={false}
        select={select}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: labels.chooseContact }));
    const cancelled = picker.mounts.at(-1);
    cancelled?.onOpenChange(false);
    await user.click(screen.getByRole('button', { name: labels.chooseContact }));
    cancelled?.onOpenChange(false);
    expect(screen.getByRole('button', { name: 'Owner choice' })).toBeInTheDocument();
    cancelled?.onSelect(selection);
    expect(select).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Owner choice' }));
    expect(select).toHaveBeenCalledExactlyOnceWith(selection.reference.uri, picker.intent);
  });

  it.each(['explicit', 'default'] as const)(
    'blocks a live selection when the %s transport origin mutates before a render',
    async (transport) => {
      const original = defaultClient.getConfig();
      const client =
        transport === 'default'
          ? defaultClient
          : createClient({ baseUrl: 'http://responsibility.test' });
      client.setConfig({ baseUrl: 'http://responsibility.test' });
      try {
        const picker = retainedPicker();
        const select = vi.fn();
        render(
          <ResponsibilityContactChooser
            identity={{
              tripId: 7,
              client: transport === 'default' ? undefined : client,
              labels,
              contactChooserIntent: () => picker.intent,
            }}
            target={{ targetKind: 'stay', targetId: 61 }}
            disabled={false}
            select={select}
          />
        );
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: labels.chooseContact }));
        client.setConfig({ baseUrl: 'http://other.test' });
        await user.click(screen.getByRole('button', { name: 'Owner choice' }));
        expect(select).not.toHaveBeenCalled();
      } finally {
        defaultClient.setConfig(original);
      }
    }
  );
});
