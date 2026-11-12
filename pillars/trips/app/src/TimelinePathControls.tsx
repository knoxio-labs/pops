import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Select, TextInput } from '@pops/ui';

import type {
  OverviewPlacementTarget,
  RoutePath,
  RouteSource,
  TripRouteController,
} from '@pops/trips-workspace';

/** Create and apply exact alternative paths; applied history is not live membership. */
export function TimelinePathControls({
  route,
  target,
}: {
  route: TripRouteController;
  target: OverviewPlacementTarget | null;
}) {
  const { t } = useTranslation('trips');
  const [gapKey, setGapKey] = useState('');
  const current = route.view?.route;
  const gaps = current?.order.filter((item) => item.kind === 'gap') ?? [];
  const gap = gaps.find((item) =>
    target?.kind === 'gap' ? item.id === target.id : String(item.id) === gapKey
  );
  const paths = current?.paths.filter((path) =>
    target?.kind === 'path' ? path.id === target.id : !gap || path.gapId === gap.id
  );
  return (
    <section className="space-y-3" aria-label={t('timeline.route.paths')}>
      {target?.kind !== 'path' && (
        <>
          {target?.kind !== 'gap' && (
            <Select
              label={t('timeline.route.gap')}
              value={gapKey}
              onChange={(event) => setGapKey(event.target.value)}
              placeholder={t('timeline.route.chooseGap')}
              options={gaps.map((item) => ({
                value: String(item.id),
                label: t('overview.source', { kind: t('overview.kinds.gap'), id: item.id }),
              }))}
            />
          )}
          <CreatePath route={route} gapId={gap?.id} />
        </>
      )}
      {paths?.map((path) => (
        <PathControls key={path.id} path={path} route={route} />
      ))}
    </section>
  );
}

function CreatePath({ route, gapId }: { route: TripRouteController; gapId: number | undefined }) {
  const { t } = useTranslation('trips');
  const [title, setTitle] = useState('');
  return (
    <>
      <TextInput
        label={t('timeline.route.pathTitle')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Button
        disabled={!!route.pending || !!route.failure || gapId === undefined}
        onClick={() => {
          if (gapId !== undefined)
            void route.run({ kind: 'path.create', gapId, title, members: [] });
        }}
      >
        {t('timeline.route.createPath')}
      </Button>
    </>
  );
}

function PathControls({ path, route }: { path: RoutePath; route: TripRouteController }) {
  const { t } = useTranslation('trips');
  const disabled = !!route.pending || !!route.failure || path.state !== 'alternative';
  const move = (index: number, offset: number) => {
    const item = path.members[index];
    const neighbour = path.members[index + offset];
    if (!item || !neighbour) return;
    const members: RouteSource[] = [...path.members];
    members[index] = neighbour;
    members[index + offset] = item;
    void route.run({ kind: 'path.reorder', pathId: path.id, members });
  };
  return (
    <section
      className="space-y-2 rounded-lg border p-3"
      aria-label={t('timeline.route.pathIdentity', { id: path.id })}
    >
      <h3 className="break-words font-medium">
        {path.title} · {t(`timeline.route.${path.state}`)}
      </h3>
      <Button
        disabled={disabled}
        onClick={() => void route.run({ kind: 'path.apply', pathId: path.id })}
      >
        {t('timeline.route.applyPath')}
      </Button>
      <ol>
        {path.members.map((member, index) => (
          <li
            className="flex min-w-0 flex-wrap items-center gap-2"
            key={`${member.kind}:${member.id}`}
          >
            <span>
              {t('overview.source', { kind: t(`overview.kinds.${member.kind}`), id: member.id })}
            </span>
            <Button
              variant="outline"
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
            >
              {t('timeline.route.up')}
            </Button>
            <Button
              variant="outline"
              disabled={disabled || index === path.members.length - 1}
              onClick={() => move(index, 1)}
            >
              {t('timeline.route.down')}
            </Button>
          </li>
        ))}
      </ol>
    </section>
  );
}
