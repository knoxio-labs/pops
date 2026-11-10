import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Select } from '@pops/ui';

import { CopyValue } from './CopyValue';
import { pointKinds } from './draft';
import { PersonFactField } from './PersonFactField';

import type { PersonSnapshot } from './contracts';
import type { PointDraft } from './draft';

/** Edit a selected observation directly while its original provider evidence remains independently visible. */
export function PointEditor({
  point,
  data,
  index,
  disabled,
  change,
  remove,
}: {
  point: PointDraft;
  data: PersonSnapshot;
  index: number;
  disabled: boolean;
  change: (point: PointDraft) => void;
  remove: () => void;
}) {
  const { t } = useTranslation('contacts');
  return (
    <li
      aria-label={t('person.methodRow', { number: index + 1 })}
      className="space-y-1 border-b border-border py-2 last:border-b-0"
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 space-y-1">
          <PointFields point={point} disabled={disabled} change={change} />
          <PointProvenance point={point} data={data} />
        </div>
        <CopyValue key={point.value} value={point.value} />
        <Button
          variant="ghost"
          className="min-h-11 min-w-11"
          disabled={disabled}
          aria-label={t('person.removeMethod', { number: index + 1 })}
          onClick={remove}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}

function PointFields({
  point,
  disabled,
  change,
}: {
  point: PointDraft;
  disabled: boolean;
  change: (point: PointDraft) => void;
}) {
  const { t } = useTranslation('contacts');
  return (
    <>
      <div className="flex flex-wrap gap-1 sm:flex-nowrap">
        <Select
          aria-label={t('person.kind')}
          variant="ghost"
          className="min-h-11 w-28 shrink-0 text-sm"
          value={point.kind}
          options={pointKinds.map((kind) => ({ value: kind, label: t(`pointKinds.${kind}`) }))}
          disabled={disabled}
          onChange={(event) => {
            const kind = pointKinds.find((kind) => kind === event.target.value);
            if (kind)
              change({
                ...point,
                kind,
                countryCode: kind === 'phone' ? point.countryCode : '',
              });
          }}
        />
        <PersonFactField
          label={t('person.label')}
          value={point.label ?? ''}
          disabled={disabled}
          change={(label) => change({ ...point, label })}
        />
      </div>
      <PersonFactField
        label={t('person.value')}
        multiline={point.kind === 'other'}
        value={point.value}
        disabled={disabled}
        change={(value) => change({ ...point, value })}
      />
      {point.kind === 'phone' && (
        <PersonFactField
          label={t('upload.country')}
          value={point.countryCode ?? ''}
          disabled={disabled}
          change={(countryCode) => change({ ...point, countryCode })}
        />
      )}
    </>
  );
}

function PointProvenance({ point, data }: { point: PointDraft; data: PersonSnapshot }) {
  const { t } = useTranslation('contacts');
  const original = data.points.find((item) => item.id === point.id);
  const source = data.sources.find((item) => item.id === original?.sourceRecordId);
  const account = data.accounts.find((item) => item.id === source?.accountId);
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 text-xs text-muted-foreground">
      <span>
        {original?.sourceRecordId
          ? (account?.label ?? account?.provider ?? t('person.unknownSource'))
          : t('person.local')}
      </span>
      {original && !original.active && <Badge variant="outline">{t('person.inactive')}</Badge>}
      {original?.preferred && <Badge variant="secondary">{t('person.preferred')}</Badge>}
    </div>
  );
}
