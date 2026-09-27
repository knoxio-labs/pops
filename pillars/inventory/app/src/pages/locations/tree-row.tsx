import { useDraggable, useDroppable } from '@dnd-kit/core';

import { cn } from '@pops/ui';

import { PLACE_ICONS } from '../../foundation/places/place-icons.js';
import { DropLine, TreeRowSurface } from './tree-row-surface.js';

import type { ReactElement } from 'react';

import type { TreeRowProps } from './tree-row-surface.js';

export type { TreeRowProps } from './tree-row-surface.js';

/** Icons used for the semantic kinds assigned to inventory places. */
export { PLACE_ICONS };

/** Renders one location row and its inline rename state. */
export function TreeRow(props: TreeRowProps): ReactElement {
  const { row } = props;
  const target = { kind: 'location' as const, locationId: row.node.id };
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `place:${row.node.id}`,
    data: { kind: 'place', id: row.node.id },
    disabled: props.offline || props.renaming !== undefined || props.lifted === true,
  });
  const { setNodeRef: setDropNodeRef } = useDroppable({
    id: `location:${row.node.id}`,
    data: { kind: 'target', target },
  });
  const grabbed = isDragging || props.lifted === true;
  return (
    <li
      ref={(node) => {
        setNodeRef(node);
        setDropNodeRef(node);
      }}
      {...attributes}
      {...listeners}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={props.selected}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      aria-grabbed={grabbed ? true : undefined}
      className={cn('relative', grabbed && 'opacity-40')}
    >
      <TreeRowSurface {...props} />
      <DropLine position="before" visible={props.drop?.position === 'before'} />
      <DropLine position="after" visible={props.drop?.position === 'after'} />
    </li>
  );
}
