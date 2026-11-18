import { Badge, Button, TableCell, TableRow } from '@pops/ui';

import { OverviewOriginals } from './OverviewOriginals';
import { OverviewOwnerCell } from './OverviewOwner';
import { sourceAction } from './source-action';

import type { JSX } from 'react';

import type { OverviewSource, OverviewViewProps } from './types';

/** Renders explicit status and document associations for one Trip source. */
export function OverviewSheetSourceRow({
  props,
  source,
  title,
  when,
  statuses,
}: {
  props: OverviewViewProps;
  source: OverviewSource;
  title: string;
  when: string;
  statuses: string[];
}): JSX.Element {
  const action = sourceAction(props, source);
  const originals = sourceDocuments(props, source);
  return (
    <TableRow
      data-constraint={statuses.includes('Purchased') ? 'hard' : 'soft'}
      data-route-kind={source.kind}
      data-route-id={source.id}
    >
      <TableCell className="text-muted-foreground">
        {when || props.labels.sheet.unknownDate}
      </TableCell>
      <TableCell className="min-w-48 whitespace-normal font-medium">
        <div className="min-w-0">
          <SourceTitle title={title} href={action.href} onOpen={action.onOpen} />
          <p className="text-xs font-normal text-muted-foreground">
            {props.labels.kind(source.kind)}
          </p>
        </div>
      </TableCell>
      <TableCell>
        {statuses.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {statuses.map((status) => (
              <Badge key={status} variant={status === 'Purchased' ? 'default' : 'outline'}>
                {props.labels.status(status)}
              </Badge>
            ))}
          </div>
        ) : (
          <Badge variant="secondary">{props.labels.sheet.onRoute}</Badge>
        )}
      </TableCell>
      <OverviewOwnerCell props={props} source={source} />
      <TableCell className="text-muted-foreground">
        <OverviewOriginals
          documents={originals}
          labels={props.labels}
          unknownLabel={props.labels.sheet.originalsUnknown}
        />
      </TableCell>
    </TableRow>
  );
}

function sourceDocuments(
  props: OverviewViewProps,
  source: OverviewSource
): OverviewViewProps['sources']['documents'] {
  return props.sources.documents?.filter(
    (document) =>
      document.tripId === props.tripId &&
      document.targetKind === source.kind &&
      document.targetId === source.id
  );
}

function SourceTitle({
  title,
  href,
  onOpen,
}: {
  title: string;
  href?: string;
  onOpen?: () => void;
}): JSX.Element {
  if (onOpen)
    return (
      <Button
        variant="link"
        className="h-auto min-h-11 whitespace-normal p-0 text-left"
        onClick={onOpen}
      >
        {title}
      </Button>
    );
  if (href)
    return (
      <a className="inline-flex min-h-11 items-center text-app-accent hover:underline" href={href}>
        {title}
      </a>
    );
  return <span>{title}</span>;
}
