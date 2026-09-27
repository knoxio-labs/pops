import { ArrowUpRight, FolderPlus, MoreHorizontal, MoveRight, Pencil, Trash2 } from 'lucide-react';

import { ButtonPrimitive, DropdownMenu, cn } from '@pops/ui';

import type { ReactElement } from 'react';

/** Callbacks exposed by a location's action menu. */
export interface PlaceMenuHandlers {
  readonly onOpen?: () => void;
  readonly onNewInside?: () => void;
  readonly onRename?: () => void;
  readonly onMove?: () => void;
  readonly onDelete?: () => void;
}

function placeMenuItems(handlers: PlaceMenuHandlers, offline: boolean) {
  return [
    handlers.onOpen
      ? {
          label: 'Open',
          value: 'open',
          icon: <ArrowUpRight className="size-4" aria-hidden />,
          onSelect: handlers.onOpen,
        }
      : null,
    offline || handlers.onNewInside === undefined
      ? null
      : {
          label: 'New place inside',
          value: 'new-inside',
          icon: <FolderPlus className="size-4" aria-hidden />,
          onSelect: handlers.onNewInside,
        },
    offline || handlers.onRename === undefined
      ? null
      : {
          label: 'Rename',
          value: 'rename',
          icon: <Pencil className="size-4" aria-hidden />,
          onSelect: handlers.onRename,
        },
    offline || handlers.onMove === undefined
      ? null
      : {
          label: 'Move',
          value: 'move',
          icon: <MoveRight className="size-4" aria-hidden />,
          onSelect: handlers.onMove,
        },
    offline || handlers.onDelete === undefined
      ? null
      : {
          label: 'Delete',
          value: 'delete',
          variant: 'destructive' as const,
          icon: <Trash2 className="size-4" aria-hidden />,
          onSelect: handlers.onDelete,
        },
  ].filter((item): item is NonNullable<typeof item> => item !== null);
}

/** Renders a place action menu, hiding edits while offline. */
export function PlaceMenu({
  name,
  handlers,
  offline = false,
  className,
}: {
  readonly name: string;
  readonly handlers: PlaceMenuHandlers;
  readonly offline?: boolean;
  readonly className?: string;
}): ReactElement {
  return (
    <DropdownMenu
      trigger={
        <ButtonPrimitive
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${name}`}
          className={cn('shrink-0 text-muted-foreground', className)}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </ButtonPrimitive>
      }
      items={placeMenuItems(handlers, offline)}
    />
  );
}
