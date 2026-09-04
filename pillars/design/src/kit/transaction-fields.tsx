import { type Account } from '@/fixtures/accounts';
import { importRows } from '@/fixtures/import-review';
import { accountSubtitle, AccountSelect } from '@/kit/account-select';
import { AccountAvatar } from '@/screens/finance/account-chip';
import { useState } from 'react';

import { Button, ChipInput, type EntityOption, EntitySelect, Label, TextInput } from '@pops/ui';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

/** An account still to be chosen, over the decided account picker. */
export function AccountField({
  label,
  accounts,
  initialId,
  error,
}: {
  label: string;
  accounts: Account[];
  initialId?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <AccountSelect accounts={accounts} initialId={initialId} ariaLabel={label} />
      <FieldError message={error} />
    </div>
  );
}

/**
 * An account the modal was opened with. It is drawn as the account itself
 * rather than as a picker showing that account, because a combobox reads as an
 * invitation to choose and this one was decided by where the person came from.
 * Change is still one click away — it is a preset, not a lock.
 */
export function FixedAccountField({
  label,
  account,
  accounts,
  reason,
}: {
  label: string;
  account: Account;
  accounts: Account[];
  reason: string;
}) {
  const [fixed, setFixed] = useState(true);
  if (!fixed) return <AccountField label={label} accounts={accounts} initialId={account.id} />;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
        <AccountAvatar account={account} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{account.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {accountSubtitle(account)}
          </span>
        </span>
        <Button variant="ghost" size="sm" onClick={() => setFixed(false)}>
          Change
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{reason}</p>
    </div>
  );
}

export function DateField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: string;
}) {
  return (
    <TextInput
      label="Date"
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
    />
  );
}

export function DescriptionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <TextInput
      label="Description"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="What this was"
    />
  );
}

/** The entities the import fixture has already seen, as the picker's pool. */
const KNOWN_ENTITIES: EntityOption[] = [
  ...new Set(importRows.map((row) => row.entity).filter((name) => name !== undefined)),
]
  .toSorted((a, b) => a.localeCompare(b))
  .map((name) => ({ id: `e-${name.toLowerCase()}`, name }));

/**
 * Who the money went to, or came from. A transfer has no entity — the other
 * side of it is an account — so this field is absent there rather than empty.
 */
export function EntityField({ initialName }: { initialName?: string }) {
  const [pool, setPool] = useState(KNOWN_ENTITIES);
  const [value, setValue] = useState(
    () => KNOWN_ENTITIES.find((entity) => entity.name === initialName)?.id
  );
  return (
    <div className="space-y-1.5">
      <Label>Entity</Label>
      <EntitySelect
        entities={pool}
        value={value}
        aria-label="Entity"
        placeholder="No entity"
        searchPlaceholder="Search entities…"
        emptyMessage="No entity matches."
        onChange={setValue}
        onCreate={(name) => {
          const minted = { id: `pending-${name}`, name, pending: true };
          setPool((prev) => [...prev, minted]);
          setValue(minted.id);
        }}
        onClear={() => setValue(undefined)}
        clearLabel="No entity"
      />
    </div>
  );
}

export function TagsField({ initial }: { initial?: string[] }) {
  return (
    <div className="space-y-1.5">
      <Label>Tags</Label>
      <ChipInput defaultValue={initial ?? []} placeholder="Add a tag" />
    </div>
  );
}
