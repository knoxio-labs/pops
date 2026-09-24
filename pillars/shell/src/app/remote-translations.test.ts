import { createInstance, type i18n as I18n } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installRemoteTranslations, parseRemoteTranslations } from './remote-translations';

import type { RemotePillarI18n } from '@pops/pillar-sdk';

async function freshInstance(): Promise<I18n> {
  const instance = createInstance();
  await instance.init({ lng: 'en-AU', fallbackLng: 'en-AU', resources: {} });
  return instance;
}

const FOOD: RemotePillarI18n = {
  namespace: 'food',
  resources: {
    'en-AU': { title: 'Food', detail: { heading: 'Recipe' } },
    'pt-BR': { title: 'Comida', detail: { heading: 'Receita' } },
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installRemoteTranslations', () => {
  it('adds the namespace in every supported locale', async () => {
    const instance = await freshInstance();

    installRemoteTranslations('food', FOOD, instance);

    expect(instance.t('food:title')).toBe('Food');
    expect(instance.t('food:detail.heading')).toBe('Recipe');
    await instance.changeLanguage('pt-BR');
    expect(instance.t('food:title')).toBe('Comida');
    expect(instance.t('food:detail.heading')).toBe('Receita');
  });

  it('registers a pillar once, however many of its surfaces load', async () => {
    const instance = await freshInstance();
    const add = vi.spyOn(instance, 'addResourceBundle');

    installRemoteTranslations('food', FOOD, instance);
    installRemoteTranslations('food', FOOD, instance);

    expect(add).toHaveBeenCalledTimes(2);
  });

  it('overwrites a stale copy of the pillar namespace', async () => {
    const instance = await freshInstance();
    instance.addResourceBundle('en-AU', 'food', { title: 'Old' });

    installRemoteTranslations('food', FOOD, instance);

    expect(instance.t('food:title')).toBe('Food');
  });

  it('keeps registrations on separate instances apart', async () => {
    const first = await freshInstance();
    const second = await freshInstance();

    installRemoteTranslations('food', FOOD, first);
    installRemoteTranslations('food', FOOD, second);

    expect(second.hasResourceBundle('en-AU', 'food')).toBe(true);
  });

  it('warns once, naming the pillar, when the bundle exports no i18n', async () => {
    const instance = await freshInstance();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    installRemoteTranslations('acme', undefined, instance);
    installRemoteTranslations('acme', undefined, instance);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("'acme'"));
    expect(instance.hasResourceBundle('en-AU', 'acme')).toBe(false);
  });
});

describe('parseRemoteTranslations', () => {
  it('returns a valid export unchanged', () => {
    expect(parseRemoteTranslations(FOOD, 'food')).toEqual(FOOD);
  });

  it('passes an absent export through as undefined', () => {
    expect(parseRemoteTranslations(undefined, 'food')).toBeUndefined();
  });

  it('throws, naming the pillar, when a locale is missing', () => {
    expect(() =>
      parseRemoteTranslations({ namespace: 'food', resources: { 'en-AU': {} } }, 'food')
    ).toThrow("external pillar 'food' bundle 'i18n' export is malformed");
  });

  it('throws when the export is not an object', () => {
    expect(() => parseRemoteTranslations('food', 'food')).toThrow(/malformed/);
  });
});
