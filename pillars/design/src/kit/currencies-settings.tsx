import { type Currency, currencies as seedCurrencies } from '@/fixtures/currencies';
import { useState } from 'react';

import {
  Badge,
  Button,
  CRUDManagementSection,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  TextInput,
} from '@pops/ui';

import { CURRENCY_KIND_OPTIONS } from './currency-create-dialog';
import { SettingsDeleteDialog } from './settings-delete-dialog';
import { SettingsRow } from './settings-row';

interface CurrencyFieldsState {
  name: string;
  setName: (v: string) => void;
  symbol: string;
  setSymbol: (v: string) => void;
  decimals: string;
  setDecimals: (v: string) => void;
  kind: Currency['kind'];
  setKind: (v: Currency['kind']) => void;
}

function useCurrencyFields(currency: Currency): CurrencyFieldsState {
  const [name, setName] = useState(currency.name);
  const [symbol, setSymbol] = useState(currency.symbol);
  const [decimals, setDecimals] = useState(String(currency.decimals));
  const [kind, setKind] = useState<Currency['kind']>(currency.kind);
  return { name, setName, symbol, setSymbol, decimals, setDecimals, kind, setKind };
}

function CurrencyFields({ fields }: { fields: CurrencyFieldsState }) {
  return (
    <div className="grid gap-4 py-4">
      <TextInput
        label="Name"
        value={fields.name}
        onChange={(e) => fields.setName(e.target.value)}
      />
      <TextInput
        label="Symbol (optional)"
        value={fields.symbol}
        onChange={(e) => fields.setSymbol(e.target.value)}
      />
      <TextInput
        label="Decimals"
        type="number"
        min="0"
        step="1"
        value={fields.decimals}
        onChange={(e) => fields.setDecimals(e.target.value)}
      />
      <Select
        label="Kind"
        options={CURRENCY_KIND_OPTIONS}
        value={fields.kind}
        onChange={(e) => fields.setKind(e.target.value as Currency['kind'])}
      />
      <p className="text-2xs text-muted-foreground">
        Changing decimals is refused if any account already uses this currency.
      </p>
    </div>
  );
}

function CurrencyEditDialog({
  currency,
  onCancel,
  onSave,
}: {
  currency: Currency;
  onCancel: () => void;
  onSave: (next: Currency) => void;
}) {
  const fields = useCurrencyFields(currency);
  const valid = fields.name.trim().length > 0 && /^\d+$/.test(fields.decimals);

  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-(--size-dialog-sm)">
        <DialogHeader>
          <DialogTitle>Edit currency {currency.code}</DialogTitle>
          <DialogDescription className="sr-only">
            Edit this currency&apos;s name, symbol, decimals and kind
          </DialogDescription>
        </DialogHeader>
        <CurrencyFields fields={fields} />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() =>
              onSave({
                ...currency,
                name: fields.name,
                symbol: fields.symbol,
                decimals: Number(fields.decimals),
                kind: fields.kind,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CurrencySubtitle({ currency }: { currency: Currency }) {
  return (
    <span className="flex items-center gap-1.5">
      {currency.symbol || '—'} · {currency.decimals} decimals
      <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px] capitalize">
        {currency.kind}
      </Badge>
    </span>
  );
}

/**
 * Currencies list as a settings section (POPS-2843): the same
 * `CRUDManagementSection` + row treatment as institutions, so the two lists
 * on this page read as one convention. Creation stays out of scope
 * (POPS-2810) — currencies are minted inline from the account form.
 */
export function CurrenciesSection({ initial }: { initial?: Currency[] }) {
  const [items, setItems] = useState<Currency[]>(initial ?? seedCurrencies);
  const [editing, setEditing] = useState<Currency | null>(null);
  const [deleting, setDeleting] = useState<Currency | null>(null);

  return (
    <CRUDManagementSection title="Currencies" description="What accounts are denominated in">
      {items.length === 0 && <p className="text-sm text-muted-foreground">No currencies yet.</p>}
      {items.map((currency) => (
        <SettingsRow
          key={currency.code}
          leading={
            <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
              {currency.code}
            </span>
          }
          title={currency.name}
          subtitle={<CurrencySubtitle currency={currency} />}
          onEdit={() => setEditing(currency)}
          onDelete={() => setDeleting(currency)}
        />
      ))}
      {editing && (
        <CurrencyEditDialog
          currency={editing}
          onCancel={() => setEditing(null)}
          onSave={(next) => {
            setItems((list) => list.map((c) => (c.code === next.code ? next : c)));
            setEditing(null);
          }}
        />
      )}
      <SettingsDeleteDialog
        open={!!deleting}
        itemLabel={deleting ? `${deleting.name} (${deleting.code})` : ''}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          setItems((list) => list.filter((c) => c.code !== deleting.code));
          setDeleting(null);
        }}
      />
    </CRUDManagementSection>
  );
}
