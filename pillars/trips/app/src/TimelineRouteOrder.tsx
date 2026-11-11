import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import type { RouteItem, TripRouteController } from '@pops/trips-workspace';

/** Edit complete root order and explicit insertion gaps without modifying any source facts. */
export function TimelineRouteOrder({ route }: { route: TripRouteController }) {
  const { t } = useTranslation('trips');
  const order = route.view?.route.order ?? [];
  const disabled = !!route.pending || !!route.failure;
  const move = (index: number, offset: number) => {
    const item = order[index];
    const neighbour = order[index + offset];
    if (!item || !neighbour) return;
    const next: RouteItem[] = [...order];
    next[index] = neighbour;
    next[index + offset] = item;
    void route.run({ kind: 'route.reorder', order: next });
  };
  return (
    <section className="space-y-3" aria-label={t('overview.route')}>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => void route.run({ kind: 'gap.create', before: null })}
      >
        {t('timeline.route.addGap')}
      </Button>
      <ol className="space-y-2">
        {order.map((item, index) => (
          <RouteRow
            key={`${item.kind}:${item.id}`}
            item={item}
            route={route}
            first={index === 0}
            last={index === order.length - 1}
            onMove={(offset) => move(index, offset)}
          />
        ))}
      </ol>
    </section>
  );
}

function RouteRow({
  item,
  route,
  first,
  last,
  onMove,
}: {
  item: RouteItem;
  route: TripRouteController;
  first: boolean;
  last: boolean;
  onMove: (offset: number) => void;
}) {
  const { t } = useTranslation('trips');
  const disabled = !!route.pending || !!route.failure;
  const title = t('overview.source', { kind: t(`overview.kinds.${item.kind}`), id: item.id });
  return (
    <li className="min-w-0 space-y-2 rounded-lg border p-3">
      <p className="break-words">{title}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={disabled || first}
          aria-label={t('timeline.route.upSource', { source: title })}
          onClick={() => onMove(-1)}
        >
          {t('timeline.route.up')}
        </Button>
        <Button
          variant="outline"
          disabled={disabled || last}
          aria-label={t('timeline.route.downSource', { source: title })}
          onClick={() => onMove(1)}
        >
          {t('timeline.route.down')}
        </Button>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => void route.run({ kind: 'gap.create', before: item })}
        >
          {t('timeline.route.gapBefore', { source: title })}
        </Button>
      </div>
    </li>
  );
}
