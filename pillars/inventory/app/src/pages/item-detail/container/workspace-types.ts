import type { StoreHereTarget } from '../../../foundation/model/contracts.js';
import type { PlacementTarget } from '../../../foundation/model/model.js';
import type { PlacementWorld } from '../../../foundation/model/placement-model.js';
import type { ItemDetailModel } from '../detail-model.js';
import type { ContainerContentsData } from './use-container-contents.js';

/** Props shared by the container workspace shell and its interactive body. */
export interface ContainerWorkspaceProps {
  model: ItemDetailModel;
  placementWorld: PlacementWorld;
  recents: readonly PlacementTarget[];
  createPlace: (name: string, parentId: string | null) => Promise<void>;
  readOnly: boolean;
  offline: boolean;
  onLinksChanged: () => void;
  storeHereOpen: boolean;
  onStoreHereChange: (open: boolean) => void;
  storeTarget: StoreHereTarget;
}

/** Props for the loaded container workspace body after contents are available. */
export interface ContainerWorkspaceBodyProps extends Omit<
  ContainerWorkspaceProps,
  'placementWorld'
> {
  contents: ContainerContentsData;
}
