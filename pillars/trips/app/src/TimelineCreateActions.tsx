import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import type { TimelineContextProps } from './timeline-context-types';
import type {
  TimelineCreatedSource,
  TimelineCreateSession,
  TimelineCreateSnapshot,
} from './timeline-create-session';

/** Keep retry and explicit new-creation actions consistent with the retained POST outcome. */
export function TimelineCreateActions({
  session,
  state,
  locked,
  onSelect,
  openCreated,
}: Pick<TimelineContextProps, 'onSelect'> & {
  session: TimelineCreateSession;
  state: TimelineCreateSnapshot;
  locked: boolean;
  openCreated: (created: TimelineCreatedSource) => void;
}) {
  const { t } = useTranslation('trips');
  const invalid =
    (state.kind === 'visit' && state.placeId === null) ||
    (state.kind === 'place' && !state.text.trim());
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => onSelect({ kind: 'create', sourceKind: null })}
      >
        {t('timeline.create.back')}
      </Button>
      {state.created ? (
        <Button
          type="button"
          className="min-h-11"
          onClick={() => {
            if (state.created) openCreated(state.created);
          }}
        >
          {t('timeline.create.open')}
        </Button>
      ) : (
        <Button type="submit" className="min-h-11" disabled={locked || Boolean(invalid)}>
          {state.kind === 'place' ? t('timeline.create.createPlace') : t('timeline.create.submit')}
        </Button>
      )}
      {(state.status === 'unknown' || state.status === 'confirmed') && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => session.beginNew()}
        >
          {t('timeline.create.beginNew')}
        </Button>
      )}
    </div>
  );
}
