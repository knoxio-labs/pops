/**
 * Form row helpers used by `CreateIngredientDialog` (and, in follow-up
 * PRs, the rename + edit dialogs). Each row is a single labeled control
 * so the dialog body stays declarative.
 */
import { useTranslation } from 'react-i18next';

import { Label, Select, type SelectOption, TextInput } from '@pops/ui';

export function TextFieldRow({
  id,
  labelKey,
  value,
  placeholder,
  autoFocus,
  onChange,
}: {
  id: string;
  labelKey: string;
  value: string;
  placeholder: string;
  autoFocus?: boolean;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('food');
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t(labelKey)}</Label>
      <TextInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        autoFocus={autoFocus}
      />
    </div>
  );
}

export function SelectRow({
  id,
  labelKey,
  value,
  options,
  onChange,
}: {
  id: string;
  labelKey: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('food');
  const selectOptions: SelectOption[] = options.map((opt) => ({
    value: opt.value,
    label: opt.label,
  }));
  return (
    <Select
      id={id}
      label={t(labelKey)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={selectOptions}
    />
  );
}
