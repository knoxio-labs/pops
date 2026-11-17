import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pops/ui';

import { OverviewSheetRow } from './OverviewSheetRow';

import type { JSX } from 'react';

import type { ProjectedRouteItem } from '../route/projection';
import type { OverviewViewProps } from './types';

/** Compact, source-linked view of the exact ordered items in the current route. */
export function OverviewSheet(
  props: OverviewViewProps & { items: ProjectedRouteItem[] }
): JSX.Element | null {
  if (!props.projection && (props.route.reading || props.route.readError)) return null;
  return (
    <div
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
      data-workspace-display="sheet"
    >
      <Table aria-label={props.labels.sheet.title}>
        <TableHeader>
          <TableRow>
            <TableHead>{props.labels.sheet.when}</TableHead>
            <TableHead>{props.labels.sheet.what}</TableHead>
            <TableHead>{props.labels.sheet.state}</TableHead>
            <TableHead>{props.labels.sheet.originals}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="whitespace-normal text-muted-foreground">
                {props.projection?.order.length
                  ? props.labels.status('workspace.noRouteResults')
                  : props.labels.empty}
              </TableCell>
            </TableRow>
          ) : (
            props.items.map((item) => (
              <OverviewSheetRow
                key={`${item.reference.kind}:${item.reference.id}`}
                {...props}
                item={item}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
