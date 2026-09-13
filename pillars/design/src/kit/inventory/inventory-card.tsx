import { HorizontalCard } from './inventory-card/horizontal-card';
import { VerticalCard } from './inventory-card/vertical-card';

import type { InventoryCardProps } from './inventory-card/types';

export type { InventoryCardProps } from './inventory-card/types';

export function InventoryCard(props: InventoryCardProps) {
  if (props.layout === 'vertical') return <VerticalCard {...props} />;
  return <HorizontalCard {...props} />;
}

InventoryCard.displayName = 'InventoryCard';
