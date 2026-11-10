import { cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ArrangementsPage } from './ArrangementsPage';
import enAU from './locales/en-AU.json';
import ptBR from './locales/pt-BR.json';

import type { RemotePageHostProps } from '@pops/pillar-sdk';
import type { ArrangementsWorkspaceProps } from '@pops/trips-workspace';

const workspace = vi.hoisted(() => vi.fn<(props: ArrangementsWorkspaceProps) => void>());
vi.mock('@pops/trips-workspace', () => ({
  ArrangementsWorkspace: (props: ArrangementsWorkspaceProps) => {
    workspace(props);
    return (
      <p>
        {props.labels.title} {props.tripId}
      </p>
    );
  },
  formatTripDate: (value: string, locale: string) => `${locale}:${value}`,
}));
const translation = createInstance();
beforeEach(async () => {
  await translation.init({
    lng: 'pt-BR',
    resources: { 'en-AU': { trips: enAU }, 'pt-BR': { trips: ptBR } },
    interpolation: { escapeValue: false },
  });
});
afterEach(() => {
  cleanup();
  workspace.mockClear();
});
function mount(path: string, host: RemotePageHostProps = {}) {
  render(
    <I18nextProvider i18n={translation}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:tripId/arrangements" element={<ArrangementsPage {...host} />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>
  );
}
describe('Arrangement source route', () => {
  it('passes the exact owning identity, translated controls and explicit active locale', () => {
    mount('/7/arrangements');
    expect(screen.getByText('Reservas e preparativos 7')).toBeVisible();
    const props = workspace.mock.calls[0]?.[0];
    if (!props) throw new Error('Expected the arrangement workspace to mount');
    expect(props.tripId).toBe(7);
    expect(props.backHref).toBe('/trips');
    expect(props.formatDate('2030-04-10')).toBe('pt-BR:2030-04-10');
    expect(props.labels.stayNights(1)).toBe('1 noite');
    expect(props.labels.stayNights(2)).toBe('2 noites');
    expect(props.labels.sourceStates.Reserved).toBe('Reservado');
  });
  it('forwards the injected Contacts owner as a lazy retained picker capability', () => {
    const intent = { Chooser: () => null };
    const contacts = { createIntent: vi.fn(() => intent) };
    mount('/7/arrangements', { contacts });
    const props = workspace.mock.calls[0]?.[0];
    expect(contacts.createIntent).not.toHaveBeenCalled();
    expect(props?.contacts).toBe(contacts);
    expect(props?.contactChooserIntent?.({ targetKind: 'rental', targetId: 61 })).toBe(intent);
    expect(props?.contactChooserIntent?.({ targetKind: 'rental', targetId: 61 })).toBe(intent);
    expect(contacts.createIntent).toHaveBeenCalledTimes(1);
  });
  it.each([
    '/0/arrangements',
    '/01/arrangements',
    '/invalid/arrangements',
    '/9007199254740992/arrangements',
  ])('rejects invalid owning identity %s before mounting a reader', (path) => {
    mount(path);
    expect(screen.getByText('Escolha uma viagem válida')).toBeVisible();
    expect(workspace).not.toHaveBeenCalled();
  });
});
