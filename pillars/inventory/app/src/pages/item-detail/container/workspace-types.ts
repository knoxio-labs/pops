import type { StoreHereTarget } from '../../../foundation/model/contracts.js';
import type { PlacementTarget } from '../../../foundation/model/model.js';
import type { PlacementWorld } from '../../../foundation/model/placement-model.js';
import type { ItemDetailModel } from '../detail-model.js';
import type { ExitKind, UnpackAction, UnpackState } from './unpack-model.js';
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

/** Props for the filterable, selectable contents pane inside a container workspace. */
export interface ContentsPaneProps {
  name: string;
  home: string;
  world: PlacementWorld;
  inside: readonly string[];
  contentCounts: Readonly<Record<string, { readonly direct: number; readonly deep: number }>>;
  state: UnpackState;
  dispatch: (action: UnpackAction) => void;
  readOnly: boolean;
  readOnlyReason?: string;
  pendingIds: ReadonlySet<string>;
  rejections: Readonly<Record<string, string>>;
  onExit: (ids: readonly string[], how: ExitKind) => void;
  onMove: (ids: readonly string[]) => void;
  onLabel: (ids: readonly string[]) => void;
  onLifecycle: (ids: readonly string[], lifecycle: 'retire' | 'discard') => void;
  onStoreHere?: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onOpenContainer: () => void;
  onRetire: () => void;
}
