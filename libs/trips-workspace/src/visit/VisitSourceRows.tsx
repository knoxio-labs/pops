import { useTranslation } from 'react-i18next';

import { Badge, Button, cn } from '@pops/ui';

import { dateLabel } from './periods';

import type { JSX } from 'react';

import type { Stay, TripEvent, VisitWorkspaceProps } from './types';

/** Independent accommodation facts; Purchased alone receives a solid boundary. */
export function StayRow({
  stay,
  identity,
}: {
  stay: Stay;
  identity: VisitWorkspaceProps;
}): JSX.Element {
  const { t, i18n } = useTranslation('trips');
  return (
    <article
      className={cn(
        'rounded-lg border border-dashed border-foreground/30 bg-card px-3 py-2 text-sm',
        stay.status === 'Purchased' && 'border-solid border-app-accent'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SourceName
          name={stay.name ?? t('visitWorkspace.stay')}
          open={identity.onViewStay && (() => identity.onViewStay?.(stay.id))}
        />
        {stay.status && (
          <Badge variant={stay.status === 'Purchased' ? 'default' : 'outline'}>
            {t(`visitWorkspace.${stay.status}`)}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {[
          dateLabel(stay.timing.arrival, i18n.resolvedLanguage ?? i18n.language),
          stay.timing.checkIn,
          dateLabel(stay.timing.departure, i18n.resolvedLanguage ?? i18n.language),
          stay.timing.checkOut,
          stay.timing.timeZone,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {stay.address && <p className="break-words text-xs text-muted-foreground">{stay.address}</p>}
    </article>
  );
}
/** Independent activity facts, including Alternative intention and original source dates. */
export function EventRow({
  event,
  identity,
}: {
  event: TripEvent;
  identity: VisitWorkspaceProps;
}): JSX.Element {
  const { t, i18n } = useTranslation('trips');
  return (
    <article
      className={cn(
        'rounded-lg border border-dashed border-foreground/30 bg-card px-3 py-2 text-sm',
        event.purchase === 'Purchased' && 'border-solid border-app-accent'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SourceName
          name={event.name ?? t('visitWorkspace.event')}
          open={identity.onViewEvent && (() => identity.onViewEvent?.(event.id))}
        />
        <div className="flex flex-wrap gap-1">
          {[event.intention, event.arrangement, event.purchase].filter(Boolean).map((value) => (
            <Badge key={value} variant={value === 'Purchased' ? 'default' : 'outline'}>
              {t(`visitWorkspace.${value}`)}
            </Badge>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {[
          dateLabel(event.timing.start, i18n.resolvedLanguage ?? i18n.language),
          event.timing.startTime,
          dateLabel(event.timing.end, i18n.resolvedLanguage ?? i18n.language),
          event.timing.endTime,
          event.timing.timeZone,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </article>
  );
}
function SourceName({ name, open }: { name: string; open: (() => void) | undefined }): JSX.Element {
  return open ? (
    <Button
      variant="ghost"
      className="min-h-11 min-w-0 whitespace-normal px-0 text-left text-sm font-medium"
      onClick={open}
    >
      {name}
    </Button>
  ) : (
    <h3 className="min-w-0 break-words text-sm font-medium">{name}</h3>
  );
}
