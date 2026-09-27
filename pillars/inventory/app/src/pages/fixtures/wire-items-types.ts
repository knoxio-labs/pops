import type { ItemRowModel } from '../../foundation/model/model.js';
import type { useItemRows } from '../../inventory-web/useWebItems.js';
import type { WireItem } from './fixture-detail-actions.js';

/** Props for the server-backed item picker used to add fixture connections. */
export interface WireItemsSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly fixture: { readonly id: string; readonly name: string };
  readonly wiredIds: ReadonlySet<string>;
  readonly online: boolean;
  readonly onWire: (items: readonly WireItem[]) => Promise<void>;
}

/** State shared by the fixture wire picker and its server-backed source view. */
export interface WireItemsState {
  readonly itemRows: ReturnType<typeof useItemRows>;
  readonly fixture: WireItemsSheetProps['fixture'];
  readonly wiredIds: ReadonlySet<string>;
  readonly online: boolean;
  readonly queryDraft: string;
  readonly selectedIds: ReadonlySet<string>;
  readonly candidates: readonly ItemRowModel[];
  readonly selected: readonly WireItem[];
  readonly wiring: boolean;
  readonly error: string | null;
  readonly setQueryDraft: (query: string) => void;
  readonly toggle: (item: ItemRowModel) => void;
  readonly wire: () => Promise<void>;
}
