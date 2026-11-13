import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle, Button } from '@pops/ui';

import type { DevicePermissionsModel } from './types.js';

/** Readable semantic error text, with an explicit discard-and-read action rather than automatic replay. */
export function PermissionNotice({ editor }: { editor: DevicePermissionsModel }) {
  const { t } = useTranslation('bfm');
  if (!editor.failure) return null;
  return (
    <div className="space-y-2">
      <GrantAlert
        title={t(`permissions.failure.${editor.failure}.title`)}
        message={t(`permissions.failure.${editor.failure}.message`)}
      />
      <Button variant="outline" className="min-h-11" onClick={editor.reload}>
        {editor.grant ? t('permissions.discardReload') : t('permissions.retry')}
      </Button>
    </div>
  );
}

/** Keeps small error text readable while the semantic border, icon and alert role identify the failure. */
export function GrantAlert({ title, message }: { title: string; message: string }) {
  return (
    <Alert className="border-destructive [&>svg]:text-destructive">
      <TriangleAlert aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="text-card-foreground">{message}</AlertDescription>
    </Alert>
  );
}
