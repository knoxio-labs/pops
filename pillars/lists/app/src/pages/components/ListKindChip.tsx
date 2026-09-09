import { useTranslation } from 'react-i18next';

import { Badge } from '@pops/ui';

import type { ReactElement } from 'react';

import type { ListKind } from '../lists-index/list-index-types.js';

const KIND_VARIANT: Record<ListKind, 'default' | 'secondary' | 'outline'> = {
  shopping: 'default',
  packing: 'secondary',
  todo: 'secondary',
  generic: 'outline',
};

interface Props {
  kind: ListKind;
}

/**
 * Single-source chip for a list's `kind`, shared by the index row and the
 * detail header. Kind carries no colour meaning elsewhere in the pillar, so
 * this stays the kit `Badge` grey/outline treatment rather than the bespoke
 * blue/amber/green palette the detail page used to draw on its own.
 */
export function ListKindChip({ kind }: Props): ReactElement {
  const { t } = useTranslation('lists');
  return (
    <Badge variant={KIND_VARIANT[kind]} data-kind={kind}>
      {t(`index.kinds.${kind}`)}
    </Badge>
  );
}
