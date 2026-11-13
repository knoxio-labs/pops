import { useTranslation } from 'react-i18next';

import { Badge } from '@pops/ui';

import { projectSelection } from './grant-selection.js';
import { GrantAlert } from './PermissionNotice.js';

import type { DeviceGrant } from './grant-selection.js';
import type { DevicePermissionsModel } from './types.js';

/** Distinguishes the last verified effective grant from the complete pending replacement. */
export function PermissionContext({
  editor,
  grant,
}: {
  editor: DevicePermissionsModel;
  grant: DeviceGrant;
}) {
  const { t } = useTranslation('bfm');
  const { unavailable } = projectSelection(grant, editor.selection);
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">
          {t(editor.failure ? 'permissions.lastEffective' : 'permissions.currentEffective')}
        </h3>
        <Badge variant="outline">{grant.effective.length}</Badge>
        <Badge variant="secondary">{grant.mode}</Badge>
      </div>
      {grant.mode === 'tracks-default' && (
        <p className="text-muted-foreground">{t('permissions.defaultExplanation')}</p>
      )}
      {unavailable.length > 0 && (
        <GrantAlert
          title={t('permissions.unavailable.title')}
          message={t('permissions.unavailable.message', { values: unavailable.join(', ') })}
        />
      )}
    </div>
  );
}

/** Shows additions and removals against the returned effective set without narrowing unrelated selections. */
export function PermissionSummary({
  editor,
  grant,
}: {
  editor: DevicePermissionsModel;
  grant: DeviceGrant;
}) {
  const { t } = useTranslation('bfm');
  const { added, removed } = projectSelection(grant, editor.selection);
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <h3 className="text-sm font-medium">{t('permissions.changes')}</h3>
      <Values label={t('permissions.add')} values={added} />
      <Values label={t('permissions.remove')} values={removed} />
      {added.length === 0 && removed.length === 0 && (
        <p className="text-muted-foreground">{t('permissions.noChanges')}</p>
      )}
      <p className="text-muted-foreground">
        {t('permissions.selectionCount', { count: editor.selection.length })}
      </p>
    </div>
  );
}

function Values({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <span className="font-medium">{label}</span>
      <ul className="list-inside list-disc">
        {values.map((value) => (
          <li key={value}>
            <code className="break-all">{value}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
