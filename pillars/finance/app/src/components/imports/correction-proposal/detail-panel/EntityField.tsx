import { toast } from 'sonner';

import { Label } from '@pops/ui';

import { EntitySelect } from '../../EntitySelect';
import { useEntities } from '../../hooks/useEntities';

/** The entity outcome of a rule — the id that applies it and the name that displays it. */
export interface EntityOutcome {
  entityId: string | null;
  entityName: string | null;
}

interface EntityFieldProps {
  value: EntityOutcome;
  onChange: (next: EntityOutcome) => void;
  disabled: boolean;
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function FieldWarning({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-warning">{children}</p>;
}

type SelectionState = 'none' | 'resolved' | 'unresolved' | 'loading';

/**
 * What the current `(entityId, entityName)` pair means, given the entities we
 * can see. `unresolved` is the pair a free-text editor used to produce: a name
 * with no id behind it, which applies no merchant at all.
 */
function describeSelection(
  value: EntityOutcome,
  entities: ReturnType<typeof useEntities>['entities']
): SelectionState {
  if (!value.entityId) return value.entityName ? 'unresolved' : 'none';
  if (!entities) return 'loading';
  return entities.some((e) => e.id === value.entityId) ? 'resolved' : 'unresolved';
}

function SelectionNote({ state, name }: { state: SelectionState; name: string | null }) {
  if (state === 'none') {
    return <FieldHint>No entity — this rule only sets transaction type / location.</FieldHint>;
  }
  if (state === 'unresolved') {
    return (
      <FieldWarning>
        {name ? `"${name}" is not a known entity — ` : 'This entity no longer exists — '}
        the rule would apply no merchant. Pick or create one.
      </FieldWarning>
    );
  }
  return null;
}

/**
 * Entity picker for a correction rule's outcome.
 *
 * `entityId` is what actually assigns the merchant when a rule fires;
 * `entityName` is only the label carried alongside it. Editing them
 * independently (as a free-text name field does) yields a rule that reads one
 * way and applies another, so this field always writes the pair together — and
 * says so when the pair is already broken on a rule it inherited.
 */
export function EntityField({ value, onChange, disabled }: EntityFieldProps) {
  const { entities, addPendingEntity, dbEntitiesData } = useEntities();
  const state = describeSelection(value, entities);

  const handleCreate = (name: string) => {
    try {
      const created = addPendingEntity({ name, type: 'company' }, dbEntitiesData?.data);
      onChange({ entityId: created.tempId, entityName: created.name });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create entity');
    }
  };

  return (
    <div className="space-y-1">
      <Label>Entity</Label>
      <EntitySelect
        aria-label="Entity"
        entities={entities ?? []}
        value={value.entityId ?? undefined}
        onChange={(entityId, entityName) => onChange({ entityId, entityName })}
        onClear={() => onChange({ entityId: null, entityName: null })}
        onCreate={handleCreate}
        placeholder={value.entityName ?? 'No entity'}
        emptyMessage="No matching entity."
        disabled={disabled}
      />
      <SelectionNote state={state} name={value.entityName} />
    </div>
  );
}
