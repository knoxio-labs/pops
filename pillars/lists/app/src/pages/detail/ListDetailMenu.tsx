import { useTranslation } from 'react-i18next';

import { DropdownMenu } from '@pops/ui';

/**
 * Three-dot action menu shown in the detail header: Rename / Change kind /
 * Archive-or-restore / Delete.
 */
export interface ListDetailMenuProps {
  isArchived: boolean;
  onRename: () => void;
  onChangeKind: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}

export function ListDetailMenu(props: ListDetailMenuProps) {
  const { t } = useTranslation('lists');

  return (
    <DropdownMenu
      align="end"
      trigger={
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-lg hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={t('detail.menu.label')}
        >
          ⋮
        </button>
      }
      items={[
        { value: 'rename', label: t('detail.menu.rename'), onSelect: props.onRename },
        {
          value: 'changeKind',
          label: t('detail.menu.changeKind'),
          onSelect: props.onChangeKind,
        },
        {
          value: 'archiveToggle',
          label: props.isArchived ? t('detail.menu.restore') : t('detail.menu.archive'),
          onSelect: props.onArchiveToggle,
        },
        {
          value: 'delete',
          label: t('detail.menu.delete'),
          variant: 'destructive',
          onSelect: props.onDelete,
        },
      ]}
    />
  );
}
