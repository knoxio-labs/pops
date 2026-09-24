import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, RemotePillarI18nSchema, SUPPORTED_LOCALES } from '../index.js';

describe('RemotePillarI18nSchema', () => {
  it('accepts a namespace with a catalogue for every supported locale', () => {
    const value = {
      namespace: 'food',
      resources: { 'en-AU': { title: 'Food' }, 'pt-BR': { title: 'Comida' } },
    };
    expect(RemotePillarI18nSchema.parse(value)).toEqual(value);
  });

  it('rejects resources missing a supported locale', () => {
    const result = RemotePillarI18nSchema.safeParse({
      namespace: 'food',
      resources: { 'en-AU': { title: 'Food' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a locale the frontend does not ship', () => {
    const result = RemotePillarI18nSchema.safeParse({
      namespace: 'food',
      resources: { 'en-AU': {}, 'pt-BR': {}, 'fr-FR': {} },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty namespace', () => {
    const result = RemotePillarI18nSchema.safeParse({
      namespace: '',
      resources: { 'en-AU': {}, 'pt-BR': {} },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a catalogue that is not an object', () => {
    const result = RemotePillarI18nSchema.safeParse({
      namespace: 'food',
      resources: { 'en-AU': 'Food', 'pt-BR': {} },
    });
    expect(result.success).toBe(false);
  });
});

describe('supported locales', () => {
  it('ships en-AU and pt-BR, falling back to en-AU', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en-AU', 'pt-BR']);
    expect(DEFAULT_LOCALE).toBe('en-AU');
  });
});
