import { registerResultComponent } from '@pops/navigation';
import { Badge, highlightMatch, SearchResultItem, statusBadgeToneClass } from '@pops/ui';

import type { ResultComponentProps } from '@pops/navigation';

interface EntityHitData extends Record<string, unknown> {
  name: string;
  type: string;
  aliases: string[];
}

const entityTypeStyles: Record<string, string> = {
  company: statusBadgeToneClass.info,
  person: statusBadgeToneClass['stat-violet'],
  place: statusBadgeToneClass.warning,
  brand: statusBadgeToneClass['stat-rose'],
  organisation: statusBadgeToneClass.success,
};

export function EntitiesResultComponent({ data, query }: ResultComponentProps<EntityHitData>) {
  const { name, type, aliases } = data;

  const style = entityTypeStyles[type] ?? 'bg-muted text-muted-foreground border-transparent';

  return (
    <SearchResultItem
      title={highlightMatch(name, query ?? '')}
      meta={
        aliases.length > 0
          ? [
              <span key="aliases" className="min-w-0 truncate">
                {aliases.join(', ')}
              </span>,
            ]
          : undefined
      }
      trailing={
        <Badge
          variant="outline"
          className={`text-2xs uppercase tracking-wider font-semibold py-0 px-1.5 h-5 shrink-0 ${style}`}
        >
          {type}
        </Badge>
      }
    />
  );
}

registerResultComponent('entities', EntitiesResultComponent);
