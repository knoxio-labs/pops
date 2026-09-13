/**
 * The props an inventory card takes, in either layout.
 *
 * Its own module so the leaf components can name it without importing
 * their parent, which the app does and which costs it a circular dependency
 * per pair (they sit in `.dependency-cruiser-known-violations.json`).
 */
import type { Condition, LocationSegment } from '@pops/ui';

export interface InventoryCardProps {
  id: string;
  itemName: string;
  brand?: string | null;
  model?: string | null;
  assetId?: string | null;
  type?: string | null;
  condition?: Condition | null;
  locationSegments?: LocationSegment[];
  /** Flat location name — used when locationSegments are not available. */
  locationName?: string | null;
  photoUrl?: string | null;
  /** Card layout: "horizontal" for list, "vertical" for grid. */
  layout?: 'horizontal' | 'vertical';
  onClick?: (id: string) => void;
  onLocationNavigate?: (segment: LocationSegment) => void;
  className?: string;
}
