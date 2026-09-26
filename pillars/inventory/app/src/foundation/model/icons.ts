import {
  Archive,
  Box,
  Cable,
  CircleQuestionMark,
  ClockAlert,
  Flame,
  Hand,
  HandGrab,
  History,
  Layers,
  LogOut,
  MapPin,
  MoveRight,
  Package,
  PackageCheck,
  PackageOpen,
  Plug,
  QrCode,
  RefreshCw,
  Shapes,
  Sigma,
  Tag,
  Trash2,
  TriangleAlert,
  Undo2,
} from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

/** Inventory concepts with a stable visual symbol across features. */
export type InventoryConcept =
  | 'item'
  | 'container'
  | 'open'
  | 'closed'
  | 'full'
  | 'location'
  | 'inHand'
  | 'pickUp'
  | 'putBack'
  | 'move'
  | 'takeOut'
  | 'code'
  | 'quantity'
  | 'retired'
  | 'discarded'
  | 'lost'
  | 'destroyed'
  | 'stale'
  | 'needsAttention'
  | 'connection'
  | 'fixture'
  | 'type'
  | 'computed'
  | 'undo'
  | 'label'
  | 'history'
  | 'sync';

/** The canonical Lucide icon for each inventory concept. */
export const INVENTORY_ICONS: Readonly<Record<InventoryConcept, LucideIcon>> = {
  item: Package,
  container: Box,
  open: PackageOpen,
  closed: Package,
  full: PackageCheck,
  location: MapPin,
  inHand: Hand,
  pickUp: HandGrab,
  putBack: Undo2,
  move: MoveRight,
  takeOut: LogOut,
  code: QrCode,
  quantity: Layers,
  retired: Archive,
  discarded: Trash2,
  lost: CircleQuestionMark,
  destroyed: Flame,
  stale: ClockAlert,
  needsAttention: TriangleAlert,
  connection: Cable,
  fixture: Plug,
  type: Shapes,
  computed: Sigma,
  undo: Undo2,
  label: Tag,
  history: History,
  sync: RefreshCw,
};
