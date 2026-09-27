import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { ListError, OfflineBanner } from '../../foundation/list-page/list-states.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import {
  fixtureDescription,
  FixtureDetailLoaded,
  staleBanner,
  WireButton,
} from './fixture-detail-content.js';
import { fixtureKindIcon } from './fixture-kinds.js';
import { FixtureDetailLoading } from './fixture-states.js';

import type { ReactElement } from 'react';

import type { FixtureDetailControls, FixtureDetailModel } from './fixture-detail-content.js';

function fixtureBreadcrumbs(name?: string): { label: string; href?: string }[] {
  const breadcrumbs = [
    { label: 'Connections', href: '/inventory/connections' },
    { label: 'Fixtures', href: '/inventory/connections/fixtures' },
  ];
  return name === undefined ? breadcrumbs : [...breadcrumbs, { label: name }];
}

/** Renders the fixture page frame, source states, facts, and wired-item controls. */
export function FixtureDetailView({
  model,
  ...controls
}: { readonly model: FixtureDetailModel } & FixtureDetailControls): ReactElement {
  const fixture = model.fixture;
  const banner = !model.online ? <OfflineBanner /> : staleBanner(model);
  if (model.fixtureStatus !== 'success' || fixture === undefined) {
    return (
      <InventoryPage
        title="Fixture"
        icon={INVENTORY_ICONS.fixture}
        breadcrumbs={fixtureBreadcrumbs()}
        banner={banner}
      >
        {model.fixtureStatus === 'pending' ? (
          <FixtureDetailLoading />
        ) : (
          <ListError noun="This fixture" onRetry={model.retryFixture} />
        )}
      </InventoryPage>
    );
  }

  if (model.placement.isError) {
    return (
      <InventoryPage
        title={fixture.name}
        icon={fixtureKindIcon(fixture.type)}
        breadcrumbs={fixtureBreadcrumbs(fixture.name)}
        actions={
          <WireButton online={model.online} onOpen={() => controls.onWireOpenChange(true)} />
        }
        banner={banner}
      >
        <ListError noun="This fixture" onRetry={model.retryPlacement} />
      </InventoryPage>
    );
  }

  if (model.placement.isLoading || model.items.status === 'pending') {
    return (
      <InventoryPage
        title={fixture.name}
        icon={fixtureKindIcon(fixture.type)}
        description={model.placement.isLoading ? undefined : fixtureDescription(fixture, model)}
        breadcrumbs={fixtureBreadcrumbs(fixture.name)}
        actions={
          <WireButton online={model.online} onOpen={() => controls.onWireOpenChange(true)} />
        }
        banner={banner}
      >
        <FixtureDetailLoading />
      </InventoryPage>
    );
  }

  return <FixtureDetailLoaded model={model} fixture={fixture} {...controls} />;
}
