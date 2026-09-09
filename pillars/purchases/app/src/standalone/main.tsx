import '@pops/ui/theme';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createPurchasesI18n } from '../app-i18n';
import { handlers } from './mock/handlers';
import { installPurchasesApiMock } from './mock/install';
import { StandaloneApp } from './StandaloneApp';

/**
 * `pillars/purchases/app` on its own: no shell, no other pillar, no backend.
 *
 * Mocks are on unless `VITE_PURCHASES_API=real`, in which case the generated
 * client's requests go to the dev server's `/purchases-api` proxy and reach a
 * pillar you are running yourself. That switch is the whole difference between
 * the two modes — no component is forked, and the pages here are the same
 * modules the shell mounts.
 */
const useRealApi = import.meta.env['VITE_PURCHASES_API'] === 'real';

if (!useRealApi) {
  installPurchasesApiMock({
    handlers,
    // Loud rather than silent: an operation with no handler is a gap in the
    // harness, and the coverage test that normally catches it does not run
    // while someone is clicking around.
    onUnhandled: (method, path) => {
      console.warn(`[standalone] no mock for ${method} ${path}`);
    },
  });
}

createPurchasesI18n();

// The shell defaults to dark (`pillars/shell/src/store/themeStore.ts`), and a
// harness for looking at this pillar's pages should show them the way a reader
// sees them. There is no toggle here — a theme switcher is shell chrome, and
// the light palette is one class away in devtools for anyone who wants it.
document.documentElement.classList.add('dark');

const root = document.querySelector('#root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <StandaloneApp />
  </StrictMode>
);
