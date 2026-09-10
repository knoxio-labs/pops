/**
 * The step indicator's words come from the same place the pending-import
 * card's do.
 *
 * They used to come from a parallel array of English literals, while every
 * other string in the wizard resolved through `useTranslation('finance')` — so
 * a pt-BR session read "Upload, Map, Process, …" in the middle of an otherwise
 * translated page (POPS-3351).
 *
 * Asserted against the translation rather than against the literal, which are
 * the same word in en-AU. What separates them is the second case: switching
 * the instance's language has to move the indicator, and it cannot if the
 * label is baked in.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen } from '@testing-library/react';
import { act } from 'react';
import { useTranslation } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import ptBRFinance from '@pops/locales/pt-BR/finance.json';

import { initialState } from '../../store/import-store-types';
import { useImportStore } from '../../store/importStore';
import { ImportWizard } from './ImportWizard';

/** The shared test instance, which `test-setup.ts` registers en-AU on. */
const i18n = renderHook(() => useTranslation('finance')).result.current.i18n;
// pt-BR is added here rather than in the shared setup: this is the only suite
// that needs a second language, and giving every other one a language it does
// not use would make a missing en-AU key fall back silently.
i18n.addResourceBundle('pt-BR', 'finance', ptBRFinance);

function renderWizard() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ImportWizard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useImportStore.setState({ ...initialState });
});

describe('the wizard step indicator', () => {
  it('names every step of a file run', () => {
    renderWizard();

    for (const label of ['Upload', 'Map', 'Process', 'Review', 'Tags', 'Rules', 'Commit']) {
      expect(screen.getByText(label), label).toBeInTheDocument();
    }
  });

  it('starts a live draft at Process rather than at Upload', () => {
    useImportStore.setState({
      ...initialState,
      currentStep: 3,
      draftSource: { kind: 'live', provider: 'up' },
    });

    renderWizard();

    expect(screen.getByText('Process')).toBeInTheDocument();
    expect(screen.queryByText('Upload')).not.toBeInTheDocument();
  });

  it('follows the active language, which a baked-in literal cannot', async () => {
    renderWizard();
    expect(screen.getByText('Process')).toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage('pt-BR');
    });

    expect(screen.getByText('Processamento')).toBeInTheDocument();
    expect(screen.queryByText('Process')).not.toBeInTheDocument();

    await act(async () => {
      await i18n.changeLanguage('en-AU');
    });
  });
});
