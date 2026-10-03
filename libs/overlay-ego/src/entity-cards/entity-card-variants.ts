import {
  ArrowLeftRight,
  Brain,
  Building2,
  FileText,
  Film,
  Landmark,
  MapPin,
  Package,
  PiggyBank,
  Receipt,
  Tv,
} from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

/** The icon and user-facing type label shown for an entity URI. */
export interface EntityCardVariant {
  label: string;
  icon: LucideIcon;
}

const VARIANTS: Readonly<Record<string, EntityCardVariant>> = {
  'finance/transaction': { icon: ArrowLeftRight, label: 'Transaction' },
  'finance/account': { icon: Landmark, label: 'Account' },
  'finance/budget': { icon: PiggyBank, label: 'Budget' },
  'finance/entity': { icon: Building2, label: 'Entity' },
  'purchases/purchase': { icon: Receipt, label: 'Purchase' },
  'purchases/purchase-item': { icon: Receipt, label: 'Purchase item' },
  'inventory/item': { icon: Package, label: 'Item' },
  'inventory/location': { icon: MapPin, label: 'Location' },
  'media/movie': { icon: Film, label: 'Movie' },
  'media/tv-show': { icon: Tv, label: 'TV show' },
  'cerebrum/engram': { icon: Brain, label: 'Engram' },
};

const FALLBACK_VARIANT: EntityCardVariant = { icon: FileText, label: 'Link' };

/** Selects a type-specific card variant using only the URI's typed prefix. */
export function variantFor(uri: string): EntityCardVariant {
  for (const [key, variant] of Object.entries(VARIANTS)) {
    if (uri.startsWith('pops:' + key + '/')) return variant;
  }
  return FALLBACK_VARIANT;
}
