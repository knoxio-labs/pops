import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { RadioInput } from '@pops/ui';

import type { SubstitutionEndpointKind } from '../types';

const KINDS = ['ingredient', 'variant'] as const satisfies readonly SubstitutionEndpointKind[];

/**
 * A compact inline toggle. `size="sm"` is what let it move onto the kit's
 * `RadioInput`: the option label used to be a hardcoded `text-sm` the parent
 * could not override, which is why this hand-composed the primitives after
 * POPS-3268 removed the id-collision reason (POPS-3298).
 */
export function KindToggle({
  kind,
  onChange,
}: {
  kind: SubstitutionEndpointKind;
  onChange: (next: SubstitutionEndpointKind) => void;
}) {
  const { t } = useTranslation('food');
  // `EndpointPicker` renders two of these on one form, so each needs its own
  // radio-group name or the second overwrites the first's entry. `RadioInput`
  // does not default one, and defaulting it there would start every existing
  // group in the repo contributing a form entry it does not today.
  const name = useId();
  return (
    <RadioInput
      name={name}
      value={kind}
      onValueChange={(next) => onChange(next as SubstitutionEndpointKind)}
      aria-label={t('data.substitutions.endpoint.kindAria')}
      size="sm"
      orientation="horizontal"
      options={KINDS.map((k) => ({
        value: k,
        label: t(`data.substitutions.endpoint.kind.${k}`),
      }))}
    />
  );
}
