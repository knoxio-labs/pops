import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Label, RadioGroup, RadioGroupItem } from '@pops/ui';

import type { SubstitutionEndpointKind } from '../types';

const KINDS = ['ingredient', 'variant'] as const satisfies readonly SubstitutionEndpointKind[];

/**
 * Composed from the `RadioGroup` primitives rather than the kit's
 * `RadioInput`: `EndpointPicker` renders two of these on a single form and
 * the toggle has to stay at `text-xs`, which `RadioInput`'s own `text-sm`
 * option labels do not expose a way to override.
 */
export function KindToggle({
  kind,
  onChange,
}: {
  kind: SubstitutionEndpointKind;
  onChange: (next: SubstitutionEndpointKind) => void;
}) {
  const { t } = useTranslation('food');
  const groupId = useId();
  return (
    <RadioGroup
      name={groupId}
      value={kind}
      onValueChange={(next) => onChange(next as SubstitutionEndpointKind)}
      aria-label={t('data.substitutions.endpoint.kindAria')}
      className="flex flex-row gap-2 text-xs"
    >
      {KINDS.map((k) => (
        <div key={k} className="flex items-center gap-1">
          <RadioGroupItem
            value={k}
            id={`${groupId}-${k}`}
            aria-label={t(`data.substitutions.endpoint.kind.${k}`)}
          />
          <Label htmlFor={`${groupId}-${k}`} className="cursor-pointer text-xs font-normal">
            {t(`data.substitutions.endpoint.kind.${k}`)}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}
