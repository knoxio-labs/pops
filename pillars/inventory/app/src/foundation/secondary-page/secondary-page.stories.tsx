import { useState } from 'react';

import { Button } from '@pops/ui';

import { INVENTORY_ICONS } from '../model/icons.js';
import { ConnectionsTabs } from './connections-tabs.js';
import {
  FIXTURE_KIND_ORDER,
  FixtureMark,
  fixtureKindLabel,
  fixtureKindOf,
} from './fixture-kinds.js';
import { ColumnHeader, EmptyBody, FilterField, NoMatchBody, SkeletonRows } from './list-parts.js';
import { ScrollPanel } from './page-shell.js';
import { LoadFailedBody, PageStateBanner } from './page-states.js';
import { PickList } from './pick-list.js';

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';

const meta = {
  title: 'Inventory/Foundation/Secondary page',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const STALE_CHANGED_AT = new Date(Date.now() - 2 * 60_000).toISOString();

const pickOptions = [
  {
    key: 'lamp',
    mark: <FixtureMark kind="power" />,
    title: 'Power outlet',
    meta: 'Kitchen · 2 connections',
  },
  {
    key: 'router',
    mark: <FixtureMark kind="network" />,
    title: 'Network port',
    meta: 'Study',
    refusal: 'Already connected to Desk lamp',
  },
] as const;

function SecondaryPageExample(): ReactElement {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const storedTypes = [...FIXTURE_KIND_ORDER, 'Garden hose'];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">List parts</h2>
        <FilterField value={filter} placeholder="Filter connections" onChange={setFilter} />
        <ColumnHeader className="grid-cols-[1fr_auto]">
          <span>Connection</span>
          <span>Room</span>
        </ColumnHeader>
        <ScrollPanel
          label="Connection list"
          className="min-h-64"
          header={
            <ColumnHeader className="grid-cols-[1fr_auto]">
              <span>Connection</span>
              <span>Room</span>
            </ColumnHeader>
          }
          footer={
            <div className="border-t px-3 py-2 text-xs text-muted-foreground">42 connections</div>
          }
        >
          <SkeletonRows rows={3} />
        </ScrollPanel>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="min-h-64 rounded-lg border bg-card">
            <EmptyBody
              icon={INVENTORY_ICONS.fixture}
              title="No fixtures yet"
              description="Record a fixture to connect it to an item."
              action={<Button size="sm">New fixture</Button>}
            />
          </div>
          <div className="min-h-64 rounded-lg border bg-card">
            <NoMatchBody what="fixtures" onClear={() => setFilter('')} />
          </div>
          <div className="min-h-64 rounded-lg border bg-card">
            <LoadFailedBody what="Connections" onRetry={() => undefined} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Page state</h2>
        <PageStateBanner
          banner="stale"
          what="Connections"
          changedAt={STALE_CHANGED_AT}
          onReload={() => undefined}
        />
        <PageStateBanner banner="offline" what="Fixtures" />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Pick list</h2>
          <PickList
            label="Things to connect"
            options={pickOptions}
            selected={selected}
            query=""
            placeholder="Search things"
            onToggle={toggle}
          />
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Pick list loading</h2>
          <PickList
            label="Loading things"
            options={pickOptions}
            selected={new Set()}
            query=""
            placeholder="Search things"
            body={<SkeletonRows rows={4} />}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Fixture kinds</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {storedTypes.map((type) => (
            <div key={type} className="flex items-center gap-2 rounded-lg border bg-card p-3">
              <FixtureMark kind={fixtureKindOf(type)} />
              <span className="text-sm">{fixtureKindLabel(type)}</span>
            </div>
          ))}
        </div>
      </section>

      <ConnectionsTabs value="connections" counts={{ connections: 42, fixtures: 6 }} />
    </div>
  );
}

/** Demonstrates every shared part used by the secondary inventory pages. */
export const SecondaryPage: Story = {
  render: () => <SecondaryPageExample />,
};
