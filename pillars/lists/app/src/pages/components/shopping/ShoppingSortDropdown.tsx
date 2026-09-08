import { useTranslation } from 'react-i18next';

import { Select } from '@pops/ui';

import { SHOPPING_SORT_MODES, type ShoppingSortMode } from './types.js';

export interface ShoppingSortDropdownProps {
  mode: ShoppingSortMode;
  onChange: (mode: ShoppingSortMode) => void;
  /**
   * When true (mobile), the label is hidden visually but kept on a
   * `sr-only` span so screen readers still announce the control.
   */
  compact?: boolean;
}

export function ShoppingSortDropdown(props: ShoppingSortDropdownProps) {
  const { t } = useTranslation('lists');
  const labelText = t('shopping.header.sort.label');

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className={props.compact === true ? 'sr-only' : 'text-muted-foreground'}>
        {labelText}
      </span>
      <Select
        value={props.mode}
        onChange={(e) => props.onChange(e.target.value as ShoppingSortMode)}
        aria-label={labelText}
        data-testid="shopping-sort-dropdown"
        options={SHOPPING_SORT_MODES.map((value) => ({
          value,
          label: t(`shopping.header.sort.options.${value}`),
        }))}
      />
    </label>
  );
}
