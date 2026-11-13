import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Checkbox } from '@pops/ui';

import { isSelectable } from './grant-selection.js';

import type { DeviceGrant } from './grant-selection.js';
import type { DevicePermissionsModel } from './types.js';

/** Renders raw server-provided strings without inferred labels or capability groups. */
export function PermissionChoices({
  editor,
  grant,
}: {
  editor: DevicePermissionsModel;
  grant: DeviceGrant;
}) {
  const { t } = useTranslation('bfm');
  const prefix = useId();
  const values = [...new Set([...grant.selectable, ...grant.stored, ...grant.effective])];
  return (
    <div className="max-h-72 overflow-y-auto rounded-md border">
      <div aria-label={t('permissions.choices')}>
        {values.map((value, index) => (
          <label
            key={value}
            htmlFor={`${prefix}-${index}`}
            className="flex min-h-11 cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-0"
          >
            <Checkbox
              id={`${prefix}-${index}`}
              checked={editor.selection.includes(value)}
              disabled={
                editor.phase !== 'ready' || editor.failure !== null || !isSelectable(grant, value)
              }
              onCheckedChange={(checked) => editor.toggle(value, checked === true)}
            />
            <span className="min-w-0 flex-1">
              <code className="break-all text-sm">{value}</code>
              {!isSelectable(grant, value) && (
                <span className="block text-xs text-muted-foreground">
                  {t('permissions.notSelectable')}
                </span>
              )}
            </span>
            {grant.effective.includes(value) && (
              <Badge variant="secondary">{t('permissions.effectiveBadge')}</Badge>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
