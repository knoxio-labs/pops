import { EntitySelect } from '@pops/ui';

import type { CurrenciesListResponses } from '../../finance-api/index.js';

type Currency = CurrenciesListResponses[200]['data'][number];

/**
 * The account's currency, backed by the real `currencies` REST resource
 * (`rest-currencies.ts`). No inline create: unlike an institution's
 * `{ name, colour }`, `currenciesCreate` also requires `decimals` and `kind`
 * (fiat vs points) — not a value a "type and hit create" row can supply
 * honestly, and standing up a currency-creation dialog is POPS-2802
 * territory the ticket names as out of scope. A household starts with the
 * seeded fiat currencies; registering a new points program stays a gap
 * (documented in the implementation report) until that ticket lands.
 */
export function CurrencySelect({
  currencies,
  value,
  onChange,
  error,
}: {
  currencies: Currency[];
  value: string;
  onChange: (code: string) => void;
  error?: string;
}) {
  const options = currencies.map((c) => ({ id: c.code, name: `${c.code} — ${c.name}` }));
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest ml-1">
        Currency
      </label>
      <EntitySelect
        entities={options}
        value={value || undefined}
        onChange={(code) => onChange(code)}
        placeholder="Select currency"
        searchPlaceholder="Search currencies..."
        emptyMessage="No currencies found."
        aria-label="Currency"
      />
      {error && <p className="text-2xs font-medium text-destructive ml-1">{error}</p>}
    </div>
  );
}
