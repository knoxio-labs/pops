import { EntitySelect } from '@pops/ui';

/** The slice of a `bank`-typed contacts Entity this picker needs. */
export interface BankEntityOption {
  id: string;
  name: string;
}

/**
 * The account's issuing institution, backed by `bank`-typed contacts
 * Entities (POPS-3063) rather than finance's own (soon-retired,
 * POPS-3064) `institutions` table — reuses `EntitySelect` since a bank
 * entity is exactly an `{ id, name }` a searchable combobox already knows
 * how to render, with inline create as its `onCreate`. Unlike the
 * institution it replaces, a bank entity's colour is assigned server-side by
 * contacts at creation — there is nothing for this picker to generate.
 */
export function InstitutionSelect({
  entities,
  value,
  onChange,
  onCreate,
}: {
  entities: BankEntityOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreate: (name: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1">
        Institution
      </label>
      <EntitySelect
        entities={entities}
        value={value ?? undefined}
        onChange={(id) => onChange(id)}
        onCreate={onCreate}
        onClear={() => onChange(null)}
        clearLabel="No institution"
        placeholder="No institution"
        searchPlaceholder="Search institutions..."
        emptyMessage="No institutions found."
        aria-label="Institution"
      />
    </div>
  );
}
