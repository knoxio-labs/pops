/**
 * The square at the start of every item row and card: the photo when there
 * is one, otherwise the item or container symbol. A photo that fails to load
 * falls back to the symbol with a broken-image mark (POPS-3617), never an
 * empty box.
 */
import { ImageOff } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../model/icons';

import type { ItemRowModel } from '../model/model';

/** Props for {@link ItemMark}. */
export interface ItemMarkProps {
  item: Pick<ItemRowModel, 'name' | 'photoUrl' | 'container'>;
  size?: 'sm' | 'md';
  /** Forces the broken-photo fallback, for review. */
  broken?: boolean;
}

const SIZES = { sm: 'size-7', md: 'size-10' } as const;

/** The item's photo or symbol. */
export function ItemMark({ item, size = 'sm', broken = false }: ItemMarkProps) {
  const [failed, setFailed] = useState(broken);
  const isContainer = item.container !== null;
  const tile = cn(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md',
    SIZES[size],
    isContainer ? 'bg-app-accent/15 text-app-accent' : 'bg-muted text-muted-foreground'
  );
  if (item.photoUrl !== null && !failed) {
    return (
      <span className={tile}>
        <img
          src={item.photoUrl}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  const Icon = isContainer ? INVENTORY_ICONS.container : INVENTORY_ICONS.item;
  return (
    <span className={tile}>
      <Icon className="size-4" aria-hidden />
      {failed ? (
        <span
          className="absolute -right-0.5 -bottom-0.5 rounded-sm bg-background p-px"
          title="Photo did not load"
        >
          <ImageOff className="size-3 text-muted-foreground" aria-label="Photo did not load" />
        </span>
      ) : null}
    </span>
  );
}
