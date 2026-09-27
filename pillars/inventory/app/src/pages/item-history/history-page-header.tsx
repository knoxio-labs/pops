import { History } from 'lucide-react';
import { Link } from 'react-router';

import { PageHeader } from '@pops/ui';

import { AccentTile } from '../../foundation/frame/page-frame.js';

function descriptionFor(count: number, hasNextPage: boolean): string {
  if (count === 0) return 'Every move, edit and lifecycle change is recorded here.';
  const label = count === 1 ? 'event' : 'events';
  return hasNextPage ? `${count} ${label} loaded` : `${count} ${label} recorded`;
}

/** Props for {@link HistoryPageHeader}. */
export interface HistoryPageHeaderProps {
  itemName: string;
  itemHref: string;
  eventCount: number;
  hasNextPage: boolean;
}

/** Renders the item-history title, breadcrumb trail, and loaded-count summary. */
export function HistoryPageHeader({
  itemName,
  itemHref,
  eventCount,
  hasNextPage,
}: HistoryPageHeaderProps) {
  return (
    <PageHeader
      title={`History of ${itemName}`}
      description={descriptionFor(eventCount, hasNextPage)}
      icon={<AccentTile icon={History} />}
      backHref={itemHref}
      breadcrumbs={[{ label: itemName, href: itemHref }, { label: 'History' }]}
      renderLink={Link}
    />
  );
}
