/**
 * The Tag Review chip's provenance label (POPS-3671).
 *
 * A suggestion the model rated 0.95 and one it rated 0.3 used to read
 * identically — "AI" — and both were ticked. The chip now says how sure the
 * model was, and says in words when a suggestion was held back, because a
 * hesitant suggestion must not read as a confident one to anyone who cannot see
 * a colour. These run against the real locale files, so a missing or renamed
 * key fails here rather than rendering the key itself to a user.
 */
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import enAUFinance from '@pops/locales/en-AU/finance.json';
import ptBRFinance from '@pops/locales/pt-BR/finance.json';

import { describeSourceMeta } from './sourceMeta';

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'en-AU',
  fallbackLng: 'en-AU',
  ns: ['finance'],
  defaultNS: 'finance',
  interpolation: { escapeValue: false },
  resources: { 'en-AU': { finance: enAUFinance }, 'pt-BR': { finance: ptBRFinance } },
  initAsync: false,
});
const t = i18n.getFixedT<'finance'>('en-AU', 'finance');
const tPt = i18n.getFixedT<'finance'>('pt-BR', 'finance');

describe('describeSourceMeta — AI confidence', () => {
  it('shows a confident, pre-accepted AI suggestion with its percentage only', () => {
    const marker = describeSourceMeta(t, { source: 'ai', confidence: 0.92, preAccept: true });

    expect(marker.visibleText).toBe('AI · 92%');
    expect(marker.accessibleText).toBe('AI · 92%, Model confidence 92%');
  });

  it('says in words that a held-back suggestion was not ticked, beside its percentage', () => {
    const marker = describeSourceMeta(t, { source: 'ai', confidence: 0.42, preAccept: false });

    expect(marker.visibleText).toBe('AI · Not ticked · 42%');
    expect(marker.accessibleText).toContain('Model confidence 42%');
  });

  it('marks a suggestion with no confidence as not ticked, and invents no percentage', () => {
    const marker = describeSourceMeta(t, { source: 'ai', preAccept: false });

    expect(marker.visibleText).toBe('AI · Not ticked');
    expect(marker.visibleText).not.toMatch(/%/);
    expect(marker.accessibleText).not.toContain('Model confidence');
  });

  it('keeps the New marker ahead of the confidence', () => {
    const marker = describeSourceMeta(t, {
      source: 'ai',
      isNew: true,
      confidence: 0.8,
      preAccept: true,
    });

    expect(marker.visibleText).toBe('AI · New · 80%');
  });

  it('rounds the percentage rather than printing the raw fraction', () => {
    expect(
      describeSourceMeta(t, { source: 'ai', confidence: 0.666, preAccept: false }).visibleText
    ).toBe('AI · Not ticked · 67%');
  });

  it('renders the same states in pt-BR from its own keys, not the English fallback', () => {
    const marker = describeSourceMeta(tPt, { source: 'ai', confidence: 0.42, preAccept: false });

    expect(marker.visibleText).toBe('IA · Não marcada · 42%');
    expect(marker.accessibleText).toContain('Confiança do modelo 42%');
  });
});

describe('describeSourceMeta — other sources are unchanged', () => {
  it('keeps a rule chip to its source and pattern, with no confidence text', () => {
    const marker = describeSourceMeta(t, { source: 'rule', pattern: 'WOOLWORTHS' });

    expect(marker.visibleText).toBe('Rule');
    expect(marker.accessibleText).toBe('Rule, Matched "WOOLWORTHS"');
  });

  it('keeps an entity chip to its source', () => {
    expect(describeSourceMeta(t, { source: 'entity' }).visibleText).toBe('Entity');
  });
});
