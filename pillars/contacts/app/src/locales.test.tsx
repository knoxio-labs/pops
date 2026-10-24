import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import ptBRUi from '@pops/locales/pt-BR/ui.json';

import { ContactError, describeContactError } from './errors';
import { UploadForm } from './imports/UploadForm';
import ptBR from './locales/pt-BR.json';

describe('contacts translations', () => {
  it('uses the active app namespace for form labels and safe errors', async () => {
    const instance = createInstance();
    await instance.init({
      lng: 'pt-BR',
      resources: { 'pt-BR': { contacts: ptBR, ui: ptBRUi } },
      interpolation: { escapeValue: false },
    });
    render(
      <I18nextProvider i18n={instance}>
        <UploadForm disabled={false} onStage={vi.fn()} />
      </I18nextProvider>
    );
    expect(screen.getByRole('textbox', { name: 'Nome da origem' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Visualizar contatos' })).toBeDisabled();
    const translated = describeContactError(
      new ContactError('forbidden', 'contacts.http.403'),
      instance.getFixedT('pt-BR', 'contacts')
    );
    expect(translated).toContain('Você não tem permissão');
    expect(translated).toContain('contacts.http.403');
  });
});
