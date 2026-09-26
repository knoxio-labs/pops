import { ConnectionsTabs } from '@/kit/inventory/connections/connections-page';
import { HintTooltip, InventoryPage, OFFLINE_REASON } from '@/kit/inventory/foundation';
import {
  LoadFailedBody,
  PageStateBanner,
  ScrollPanel,
  SkeletonRows,
} from '@/kit/inventory/secondary-page';
/**
 * `/inventory/connections/fixtures`: the second tab of Connections. Every
 * house fixture, filterable by name, wired item and kind, with New fixture in
 * the header. A row opens the fixture's page.
 */
import { Cable, Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

import { FixtureFormDialog } from './fixture-form-dialog';
import { NO_FIXTURE_FILTER, filterFixtures, fixtureRows } from './fixture-model';
import { FixturesList } from './fixtures-list';

import type { PlacementWorld } from '@/kit/inventory/foundation';
import type { PageBanner } from '@/kit/inventory/secondary-page';

import type { ConnectionModel, FixtureFilter, FixtureModel } from './fixture-model';

/** Props for {@link FixturesPage}. */
export interface FixturesPageProps {
  fixtures: readonly FixtureModel[];
  connections: readonly ConnectionModel[];
  world: PlacementWorld;
  status?: 'ready' | 'loading' | 'error';
  banner?: PageBanner;
  filter?: FixtureFilter;
  newOpen?: boolean;
  onNavigate?: (to: string) => void;
}

function NewFixtureButton({ offline, onClick }: { offline: boolean; onClick: () => void }) {
  return (
    <HintTooltip label="Record a fixture" disabledReason={offline ? OFFLINE_REASON : undefined}>
      <Button
        aria-disabled={offline || undefined}
        className={offline ? 'opacity-50' : undefined}
        prefix={<Plus className="size-4" aria-hidden />}
        onClick={offline ? undefined : onClick}
      >
        New fixture
      </Button>
    </HintTooltip>
  );
}

/** The fixtures tab. */
export function FixturesPage(props: FixturesPageProps) {
  const [filter, setFilter] = useState(props.filter ?? NO_FIXTURE_FILTER);
  const [newOpen, setNewOpen] = useState(props.newOpen ?? false);
  const all = fixtureRows(props.fixtures, props.connections, props.world);
  const rows = filterFixtures(all, filter, props.world);
  const offline = props.banner === 'offline';
  const body = () => {
    if (props.status === 'loading')
      return (
        <ScrollPanel>
          <SkeletonRows />
        </ScrollPanel>
      );
    if (props.status === 'error')
      return (
        <ScrollPanel>
          <LoadFailedBody what="Fixtures" />
        </ScrollPanel>
      );
    return (
      <FixturesList
        rows={rows}
        total={all.length}
        filter={filter}
        world={props.world}
        onFilterChange={setFilter}
        onOpen={(id) => props.onNavigate?.(`fixture:${id}`)}
        onNew={() => setNewOpen(true)}
      />
    );
  };
  return (
    <InventoryPage
      icon={Cable}
      title="Connections"
      description="What plugs into, feeds or pairs with what, across the house."
      actions={<NewFixtureButton offline={offline} onClick={() => setNewOpen(true)} />}
      tabs={
        <ConnectionsTabs
          value="fixtures"
          counts={{ connections: props.connections.length, fixtures: props.fixtures.length }}
          onChange={(tab) => props.onNavigate?.(tab)}
        />
      }
      banner={<PageStateBanner banner={props.banner} what="Fixtures" />}
    >
      {body()}
      <FixtureFormDialog open={newOpen} onOpenChange={setNewOpen} world={props.world} />
    </InventoryPage>
  );
}
