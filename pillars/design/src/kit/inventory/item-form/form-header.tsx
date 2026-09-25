/**
 * The form's page header: what is being made or changed, and the three
 * verbs with their keys. Save stays visible when it cannot run and says why
 * in its tooltip, rather than disappearing.
 */
import { Button, PageHeader } from '@pops/ui';

import { HintTooltip } from '../shared/hint-tooltip';
import { INVENTORY_ICONS } from '../shared/icons';
import { ShortcutHint } from '../shared/kbd';
import { AccentTile } from '../shared/page-frame';

/** Props for {@link FormHeader}. */
export interface FormHeaderProps {
  mode: 'create' | 'edit';
  editingName?: string;
  container: boolean;
  saving: boolean;
  /** Why Save cannot run, or null. */
  blocked: string | null;
  onCancel: () => void;
  onSave: () => void;
}

function Actions({ mode, saving, blocked, onCancel, onSave }: FormHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <HintTooltip label="Cancel" shortcutId="form-cancel">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </HintTooltip>
      {mode === 'create' ? (
        <HintTooltip
          label="Save and start another"
          shortcutId="form-save-new"
          disabledReason={blocked ?? undefined}
        >
          <Button variant="outline" disabled={saving} aria-disabled={blocked !== null || undefined}>
            Save and new
          </Button>
        </HintTooltip>
      ) : null}
      <HintTooltip label="Save" shortcutId="form-save" disabledReason={blocked ?? undefined}>
        <Button
          loading={saving}
          loadingText="Saving"
          aria-disabled={blocked !== null || undefined}
          onClick={onSave}
          suffix={saving ? undefined : <ShortcutHint id="form-save" onPrimary />}
          className={blocked === null ? undefined : 'opacity-60'}
        >
          {mode === 'create' ? 'Create item' : 'Save changes'}
        </Button>
      </HintTooltip>
    </div>
  );
}

/** The header. */
export function FormHeader(props: FormHeaderProps) {
  const Icon = props.container ? INVENTORY_ICONS.container : INVENTORY_ICONS.item;
  const title = props.mode === 'create' ? 'New item' : `Edit ${props.editingName ?? 'item'}`;
  const description =
    props.mode === 'create'
      ? 'Only the name is required. Everything else can be added later.'
      : 'Saving writes only the fields you change.';
  return (
    <PageHeader
      title={title}
      description={description}
      icon={<AccentTile icon={Icon} />}
      actions={<Actions {...props} />}
    />
  );
}
