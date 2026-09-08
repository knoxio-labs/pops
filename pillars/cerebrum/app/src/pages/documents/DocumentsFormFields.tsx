import { useTranslation } from 'react-i18next';

import { Checkbox, Input, Label, Select, type SelectOption } from '@pops/ui';

import {
  GENERATION_MODES,
  type DocumentsFormState,
  type GenerationMode,
} from '../../documents/types';
import { TOUCH_TARGET_MIN_HEIGHT } from '../../utils/touchTarget';

interface FieldsProps {
  form: DocumentsFormState;
  setForm: (next: DocumentsFormState) => void;
}

export function ModeField({ form, setForm }: FieldsProps) {
  const { t } = useTranslation('cerebrum');
  const modeOptions: SelectOption[] = GENERATION_MODES.map((mode) => ({
    value: mode,
    label: t(`documents.modes.${mode}`),
  }));
  return (
    <Select
      id="doc-mode"
      label={t('documents.form.mode')}
      aria-label={t('documents.form.mode')}
      className={TOUCH_TARGET_MIN_HEIGHT}
      value={form.mode}
      options={modeOptions}
      onChange={(e) => setForm({ ...form, mode: e.target.value as GenerationMode })}
    />
  );
}

export function QueryField({ form, setForm }: FieldsProps) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="doc-query">{t('documents.form.query')}</Label>
      <Input
        id="doc-query"
        className={TOUCH_TARGET_MIN_HEIGHT}
        value={form.query}
        placeholder={t('documents.form.queryPlaceholder')}
        onChange={(e) => setForm({ ...form, query: e.currentTarget.value })}
      />
    </div>
  );
}

export function DateRangeFields({ form, setForm }: FieldsProps) {
  const { t } = useTranslation('cerebrum');
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="doc-from">{t('documents.form.dateFrom')}</Label>
        <Input
          id="doc-from"
          type="date"
          className={TOUCH_TARGET_MIN_HEIGHT}
          value={form.dateFrom}
          onChange={(e) => setForm({ ...form, dateFrom: e.currentTarget.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="doc-to">{t('documents.form.dateTo')}</Label>
        <Input
          id="doc-to"
          type="date"
          className={TOUCH_TARGET_MIN_HEIGHT}
          value={form.dateTo}
          onChange={(e) => setForm({ ...form, dateTo: e.currentTarget.value })}
        />
      </div>
    </div>
  );
}

export function FilterFields({ form, setForm }: FieldsProps) {
  const { t } = useTranslation('cerebrum');
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="doc-audience">{t('documents.form.audience')}</Label>
        <Input
          id="doc-audience"
          className={TOUCH_TARGET_MIN_HEIGHT}
          value={form.audienceScope}
          placeholder={t('documents.form.audiencePlaceholder')}
          onChange={(e) => setForm({ ...form, audienceScope: e.currentTarget.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="doc-scopes">{t('documents.form.scopes')}</Label>
        <Input
          id="doc-scopes"
          className={TOUCH_TARGET_MIN_HEIGHT}
          value={form.scopes}
          onChange={(e) => setForm({ ...form, scopes: e.currentTarget.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="doc-tags">{t('documents.form.tags')}</Label>
        <Input
          id="doc-tags"
          className={TOUCH_TARGET_MIN_HEIGHT}
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.currentTarget.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={form.includeSecret}
          onCheckedChange={(next) => setForm({ ...form, includeSecret: next === true })}
          aria-label={t('documents.form.includeSecret')}
        />
        {t('documents.form.includeSecret')}
      </label>
    </>
  );
}
