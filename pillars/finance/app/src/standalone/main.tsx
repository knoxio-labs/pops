import '@pops/ui/theme';

import '../../remote.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createFinanceI18n } from '../app-i18n';
import { installFinanceMocks } from './mock/install';
import { StandaloneApp } from './StandaloneApp';

/**
 * `pillars/finance/app` on its own: no shell, no other pillar, no backend.
 *
 * Mocks are on unless `VITE_FINANCE_API=real`, in which case the generated
 * clients' requests go to the dev server's `/finance-api`, `/contacts-api` and
 * `/purchases-api` proxies and reach pillars you are running yourself.
 *
 * `VITE_CONTACTS_API=absent` (mocked mode) makes every contacts operation
 * answer the registry's `pillar-unavailable`, so the app's contacts-down path
 * is what renders. Neither switch forks a component: the pages here are the
 * same modules the shell mounts.
 */
const useRealApi = import.meta.env['VITE_FINANCE_API'] === 'real';
const contactsAbsent = import.meta.env['VITE_CONTACTS_API'] === 'absent';

if (!useRealApi) {
  installFinanceMocks({
    contacts: contactsAbsent ? 'absent' : 'present',
    // Loud rather than silent: an operation with no handler is a gap in the
    // harness, and the coverage test that normally catches it does not run
    // while someone is clicking around.
    onUnhandled: (method, path) => {
      console.warn(`[standalone] no mock for ${method} ${path}`);
    },
  });
}

createFinanceI18n();

// The shell defaults to dark (`pillars/shell/src/store/themeStore.ts`), and a
// harness for looking at this pillar's pages should show them the way a reader
// sees them.
document.documentElement.classList.add('dark');

const root = document.querySelector('#root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <StandaloneApp />
  </StrictMode>
);
