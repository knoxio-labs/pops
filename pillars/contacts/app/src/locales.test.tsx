import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import ptBRUi from '@pops/locales/pt-BR/ui.json';

import { ContactError, describeContactError } from './errors';
import { UploadForm } from './imports/UploadForm';
import enAU from './locales/en-AU.json';
import ptBR from './locales/pt-BR.json';

function strings(value: unknown, prefix = ''): Map<string, string> {
  if (typeof value === 'string') return new Map([[prefix, value]]);
  if (typeof value !== 'object' || value === null)
    throw new Error('Translation values must be strings or dictionaries');
  return new Map(
    Object.entries(value).flatMap(([key, item]) => [
      ...strings(item, prefix ? `${prefix}.${key}` : key),
    ])
  );
}

describe('contacts translations', () => {
  it('keeps every key and interpolation variable in parity between en-AU and pt-BR', () => {
    const english = strings(enAU);
    const portuguese = strings(ptBR);
    expect([...english.keys()].toSorted()).toEqual([...portuguese.keys()].toSorted());
    for (const [key, value] of english) {
      expect(
        portuguese
          .get(key)
          ?.match(/\{\{\w+\}\}/gu)
          ?.toSorted(),
        key
      ).toEqual(value.match(/\{\{\w+\}\}/gu)?.toSorted());
    }
  });
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
