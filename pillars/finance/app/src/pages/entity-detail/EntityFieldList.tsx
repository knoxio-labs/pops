import { Card, CardContent, cn } from '@pops/ui';

import type { Entity } from '../../contacts-api/types.gen.js';

function DefinitionRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-[140px_1fr] gap-4 py-2.5 text-sm', className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/**
 * The entity's contacts-owned fields, laid out as definitions rather than a
 * form. Deliberately ABN/aliases/notes only — `defaultTransactionType` and
 * `defaultTags` are finance's own extension of the entity, not contacts', so
 * they stay off this page (POPS-3076).
 */
export function EntityFieldList({ entity }: { entity: Entity }) {
  return (
    <Card>
      <CardContent>
        <dl className="divide-y">
          <DefinitionRow label="ABN">
            {entity.abn ?? <span className="text-muted-foreground">Not recorded</span>}
          </DefinitionRow>
          <DefinitionRow label="Aliases">
            {entity.aliases.length > 0 ? (
              entity.aliases.join(', ')
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </DefinitionRow>
          <DefinitionRow label="Notes" className="items-start">
            {entity.notes ?? <span className="text-muted-foreground">No notes</span>}
          </DefinitionRow>
        </dl>
      </CardContent>
    </Card>
  );
}
