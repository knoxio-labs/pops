import '@pops/ui/theme';
import './i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';

import { TokensSheet } from './pages/TokensSheet';
import { AppShell } from './shell/AppShell';
import { FrameShell } from './shell/FrameShell';
import { Screen } from './shell/Screen';

const root = document.querySelector('#root');
if (!root) throw new Error('Root element not found');

/** `/design` in production and dev alike — see `base` in vite.config.ts. */
const basename = import.meta.env.BASE_URL.replace(/\/$/u, '');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/frame" element={<FrameShell />}>
          <Route path="tokens" element={<TokensSheet />} />
          <Route path="s/:area/:slug" element={<Screen />} />
          <Route path="s/:area/:slug/:stepId" element={<Screen />} />
          <Route path="x/:experimentId/:variantId/s/:area/:slug" element={<Screen />} />
          <Route path="x/:experimentId/:variantId/s/:area/:slug/:stepId" element={<Screen />} />
        </Route>
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
