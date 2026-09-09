import { useTranslation } from 'react-i18next';

import { DropdownMenu } from '@pops/ui';

/**
 * Three-dot menu surfaced per item row: Edit / Move up / Move down / Delete.
 * Move up/down are also accessible via drag, but the menu is the keyboard +
 * mobile-fallback path.
 */
export interface ListItemMenuProps {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

export function ListItemMenu(props: ListItemMenuProps) {
  const { t } = useTranslation('lists');

  return (
    <DropdownMenu
      align="end"
      trigger={
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={t('detail.item.menu.label')}
        >
          ⋮
        </button>
      }
      items={[
        { value: 'edit', label: t('detail.item.menu.edit'), onSelect: props.onEdit },
        {
          value: 'moveUp',
          label: t('detail.item.menu.moveUp'),
          disabled: !props.canMoveUp,
          onSelect: props.onMoveUp,
        },
        {
          value: 'moveDown',
          label: t('detail.item.menu.moveDown'),
          disabled: !props.canMoveDown,
          onSelect: props.onMoveDown,
        },
        {
          value: 'delete',
          label: t('detail.item.menu.delete'),
          variant: 'destructive',
          onSelect: props.onDelete,
        },
      ]}
    />
  );
}
