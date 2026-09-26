import { ArrowLeft, Check, Plus } from 'lucide-react';
import { Link } from 'react-router';

import { Button, PageHeader } from '@pops/ui';

import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip';
import { ShortcutHint } from '../../foundation/shortcuts/shortcut-hint';

import type { ReactElement } from 'react';

/** Props for the item-form header and its save actions. */
export interface FormHeaderProps {
  readonly mode: 'create' | 'edit';
  readonly editingName: string | null;
  readonly saving: boolean;
  readonly blocked: string | null;
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly onSaveAndNew: () => void;
}

function SaveActions({
  mode,
  saving,
  blocked,
  onSave,
  onSaveAndNew,
}: Pick<FormHeaderProps, 'mode' | 'saving' | 'blocked' | 'onSave' | 'onSaveAndNew'>): ReactElement {
  return (
    <>
      {mode === 'create' ? (
        <HintTooltip
          label="Save and start another"
          shortcutId="form-save-new"
          disabledReason={blocked ?? undefined}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            aria-disabled={blocked !== null || undefined}
            onClick={onSaveAndNew}
            prefix={<Plus className="size-4" aria-hidden />}
          >
            Save and start another
          </Button>
        </HintTooltip>
      ) : null}
      <HintTooltip label="Save" shortcutId="form-save" disabledReason={blocked ?? undefined}>
        <Button
          type="button"
          size="sm"
          loading={saving}
          loadingText="Saving"
          disabled={saving}
          aria-disabled={blocked !== null || undefined}
          onClick={onSave}
          prefix={<Check className="size-4" aria-hidden />}
        >
          {saving ? 'Saving' : primaryLabelFor(mode)}
        </Button>
      </HintTooltip>
      <ShortcutHint id="form-save" className="hidden sm:inline-flex" onPrimary />
    </>
  );
}

function HeaderActions({
  mode,
  saving,
  blocked,
  onCancel,
  onSave,
  onSaveAndNew,
}: Pick<
  FormHeaderProps,
  'mode' | 'saving' | 'blocked' | 'onCancel' | 'onSave' | 'onSaveAndNew'
>): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <HintTooltip label="Cancel" shortcutId="form-cancel">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={onCancel}
          prefix={<ArrowLeft className="size-4" aria-hidden />}
        >
          Cancel
        </Button>
      </HintTooltip>
      <SaveActions
        mode={mode}
        saving={saving}
        blocked={blocked}
        onSave={onSave}
        onSaveAndNew={onSaveAndNew}
      />
    </div>
  );
}

function primaryLabelFor(mode: FormHeaderProps['mode']): string {
  return mode === 'create' ? 'Create item' : 'Save changes';
}

/** Renders breadcrumbs and the form's keyboard-labelled save actions. */
export function FormHeader({
  mode,
  editingName,
  saving,
  blocked,
  onCancel,
  onSave,
  onSaveAndNew,
}: FormHeaderProps): ReactElement {
  const title = mode === 'edit' ? `Edit ${editingName ?? 'item'}` : 'New item';
  const description =
    mode === 'create'
      ? 'Only the name is required. Everything else can be added later.'
      : 'Saving writes only the fields you change.';
  const breadcrumbs =
    mode === 'edit'
      ? [
          { label: 'Inventory', href: '/inventory' },
          { label: editingName ?? 'Item', href: undefined },
          { label: 'Edit' },
        ]
      : [{ label: 'Inventory', href: '/inventory' }, { label: 'New item' }];
  return (
    <PageHeader
      title={title}
      description={description}
      backHref={mode === 'edit' && editingName !== null ? undefined : '/inventory/items'}
      breadcrumbs={breadcrumbs}
      renderLink={Link}
      actions={
        <HeaderActions
          mode={mode}
          saving={saving}
          blocked={blocked}
          onCancel={onCancel}
          onSave={onSave}
          onSaveAndNew={onSaveAndNew}
        />
      }
      className="mb-6"
    />
  );
}
