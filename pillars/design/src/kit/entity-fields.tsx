import { DefinitionRow } from '@/kit/entity-header';

import { Badge } from '@pops/ui';

import type { Entity } from '@/fixtures/entities';

/**
 * The entity's data fields, laid out as definitions rather than a form — this
 * is the read view. Every field is optional on the model, so each row falls
 * back to a muted placeholder instead of disappearing: a details page that
 * hides empty fields looks incomplete for reasons the viewer can't see.
 */
export function EntityFieldList({ entity }: { entity: Entity }) {
  return (
    <dl className="divide-y">
      <DefinitionRow label="ABN">
        {entity.abn ?? <span className="text-muted-foreground">Not recorded</span>}
      </DefinitionRow>
      <DefinitionRow label="Aliases">
        {entity.aliases && entity.aliases.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {entity.aliases.map((alias) => (
              <Badge key={alias} variant="secondary">
                {alias}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
      </DefinitionRow>
      <DefinitionRow label="Default transaction">
        {entity.defaultTransactionType ?? <span className="text-muted-foreground">Not set</span>}
      </DefinitionRow>
      <DefinitionRow label="Default tags">
        {entity.defaultTags && entity.defaultTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {entity.defaultTags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
      </DefinitionRow>
      <DefinitionRow label="Notes" className="items-start">
        {entity.notes ?? <span className="text-muted-foreground">No notes</span>}
      </DefinitionRow>
    </dl>
  );
}
