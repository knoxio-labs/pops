import { currencies } from '@/fixtures/currencies';
import { institutions } from '@/fixtures/institutions';
import { CurrenciesSection } from '@/kit/currencies-settings';
import { InstitutionsSection } from '@/kit/institutions-settings';

import { PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { Currency } from '@/fixtures/currencies';
import type { Institution } from '@/fixtures/institutions';

export const meta: ScreenMeta = { title: 'Settings', order: 8, frame: 'web' };

/**
 * Institutions and currencies, managed on one page (POPS-2843): both are
 * short reference lists minted inline from the account form (POPS-2810) and
 * only ever edited or retired here, never created — splitting them into tabs
 * or separate screens would cost a click for no payoff at this size.
 */
export function SettingsPage({
  institutions: institutionItems,
  currencies: currencyItems,
}: {
  institutions: Institution[];
  currencies: Currency[];
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader title="Settings" description="Manage institutions and currencies" />
      <InstitutionsSection initial={institutionItems} />
      <CurrenciesSection initial={currencyItems} />
    </div>
  );
}

export const states: ScreenStates = {
  empty: () => <SettingsPage institutions={[]} currencies={[]} />,
  'institutions-only': () => <SettingsPage institutions={institutions} currencies={[]} />,
  'currencies-only': () => <SettingsPage institutions={[]} currencies={currencies} />,
};

export default function SettingsScreen() {
  return <SettingsPage institutions={institutions} currencies={currencies} />;
}
