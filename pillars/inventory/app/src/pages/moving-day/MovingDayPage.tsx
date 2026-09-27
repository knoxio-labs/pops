import { Truck } from 'lucide-react';

import { NewItemButton } from '../../foundation/frame/new-item-button.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { MovingDayBody, MovingDayOverlay } from './moving-day-page-content.js';
import { useMovingDayPageModel } from './moving-day-page-model.js';

import type { ReactElement } from 'react';

/** Renders the inventory moving-day board, search, packing actions, and box panel. */
export function MovingDayPage(): ReactElement {
  const model = useMovingDayPageModel();
  return (
    <InventoryPage
      title="Moving day"
      icon={Truck}
      description="Packing up the house"
      actions={
        <NewItemButton label="New box" offline={!model.online} onNavigate={model.navigate} />
      }
      banner={model.banner}
      overlay={<MovingDayOverlay model={model} />}
      bodyClassName="gap-3"
    >
      <MovingDayBody model={model} />
    </InventoryPage>
  );
}
