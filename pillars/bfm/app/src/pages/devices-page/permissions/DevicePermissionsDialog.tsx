import { useTranslation } from 'react-i18next';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@pops/ui';

import { projectSelection } from './grant-selection.js';
import { PermissionChoices } from './PermissionChoices.js';
import { PermissionNotice } from './PermissionNotice.js';
import { PermissionContext, PermissionSummary } from './PermissionSummary.js';

import type { DevicePermissionsModel } from './types.js';

/** Contextual Devices editor; the model guards dismissal on the wire and restores the originating action. */
export function DevicePermissionsDialog({ editor }: { editor: DevicePermissionsModel }) {
  const { t } = useTranslation('bfm');
  return (
    <Dialog
      open={editor.open}
      onOpenChange={(open) => {
        if (!open) editor.close();
      }}
    >
      <DialogContent
        className="md:max-w-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          editor.origin.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('permissions.title', { name: editor.target?.name ?? '' })}</DialogTitle>
          <DialogDescription>
            {editor.target?.subjectEmail ?? t('devices.owner.operator')} · {editor.target?.model}
          </DialogDescription>
        </DialogHeader>
        {editor.phase === 'loading' && (
          <Skeleton role="status" aria-label={t('permissions.loading')} className="h-40 w-full" />
        )}
        <PermissionNotice editor={editor} />
        {editor.grant && (
          <>
            <PermissionContext editor={editor} grant={editor.grant} />
            <PermissionChoices editor={editor} grant={editor.grant} />
            <PermissionSummary editor={editor} grant={editor.grant} />
          </>
        )}
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {editor.saved ? t('permissions.saved') : ''}
        </p>
        <PermissionFooter editor={editor} />
      </DialogContent>
    </Dialog>
  );
}

function PermissionFooter({ editor }: { editor: DevicePermissionsModel }) {
  const { t } = useTranslation('bfm');
  const projection = editor.grant ? projectSelection(editor.grant, editor.selection) : null;
  const canSave =
    editor.phase === 'ready' &&
    editor.failure === null &&
    projection !== null &&
    projection.changed &&
    projection.unavailable.length === 0;
  return (
    <DialogFooter>
      <Button
        variant="outline"
        className="min-h-11"
        disabled={editor.phase === 'saving'}
        onClick={editor.close}
      >
        {t(editor.saved ? 'permissions.done' : 'permissions.cancel')}
      </Button>
      <Button className="min-h-11" disabled={!canSave} onClick={editor.save}>
        {t(editor.phase === 'saving' ? 'permissions.saving' : 'permissions.save')}
      </Button>
    </DialogFooter>
  );
}
