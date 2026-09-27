import { NewItemButton } from '../../foundation/frame/new-item-button.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { ContainersBody, ContainersSelectionBar } from './containers-list.js';
import { useContainersPageSources } from './containers-page-model.js';
import { ContainersBanner, ContainersToolbar } from './containers-toolbar.js';

import type { ReactElement } from 'react';

/** Renders the server-backed Containers browser and its state segments. */
export function ContainersPage(): ReactElement {
  const model = useContainersPageSources();
  return (
    <InventoryPage
      title="Containers"
      icon={INVENTORY_ICONS.container}
      actions={
        <NewItemButton label="New container" offline={!model.online} onNavigate={model.navigate} />
      }
      banner={<ContainersBanner model={model} />}
      toolbar={<ContainersToolbar model={model} />}
      dock={<ContainersSelectionBar model={model} />}
    >
      <ContainersBody model={model} />
    </InventoryPage>
  );
}
