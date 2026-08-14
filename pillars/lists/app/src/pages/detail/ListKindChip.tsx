import { useTranslation } from 'react-i18next';

import type { ListKind } from './types.js';

/**
 * Inline chip used in the detail header (and reused by the index card in
 * future 140-B). Stays plain HTML on purpose — see ListsLandingPage header
 * comment for the rationale behind keeping `app-lists` free of `@pops/ui`.
 */
const KIND_COLOURS: Record<ListKind, string> = {
  shopping: 'bg-info/15 text-info',
  packing: 'bg-warning/15 text-warning',
  todo: 'bg-success/15 text-success',
  generic: 'bg-muted text-muted-foreground',
};

export function ListKindChip({ kind }: { kind: ListKind }) {
  const { t } = useTranslation('lists');
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${KIND_COLOURS[kind]}`}
      data-testid="list-kind-chip"
    >
      {t(`detail.kind.${kind}`)}
    </span>
  );
}
