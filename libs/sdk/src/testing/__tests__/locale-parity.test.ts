import { describe, expect, it } from 'vitest';

import { localeCatalogueProblems } from '../locale-parity.js';

describe('localeCatalogueProblems', () => {
  it('reports nothing for catalogues in step, nested sections included', () => {
    expect(
      localeCatalogueProblems({
        'en-AU': { save: 'Save', detail: { title: 'Detail' } },
        'pt-BR': { save: 'Salvar', detail: { title: 'Detalhe' } },
      })
    ).toEqual([]);
  });

  it('reports a key the default locale has and another lacks', () => {
    expect(
      localeCatalogueProblems({
        'en-AU': { save: 'Save', detail: { title: 'Detail' } },
        'pt-BR': { save: 'Salvar' },
      })
    ).toEqual(['pt-BR is missing "detail.title"']);
  });

  it('reports a key another locale has and the default locale lacks', () => {
    expect(
      localeCatalogueProblems({
        'en-AU': { save: 'Save' },
        'pt-BR': { save: 'Salvar', extra: 'Extra' },
      })
    ).toEqual(['pt-BR has "extra", which en-AU lacks']);
  });

  it('reports empty and whitespace-only values in any locale', () => {
    expect(
      localeCatalogueProblems({
        'en-AU': { save: '' },
        'pt-BR': { save: '  ' },
      })
    ).toEqual(['en-AU "save" is empty', 'pt-BR "save" is empty']);
  });

  it('reports a leaf that is neither a string nor a nested object', () => {
    expect(
      localeCatalogueProblems({
        'en-AU': { a: { b: 5 }, c: null, d: ['x'] },
        'pt-BR': { a: { b: 'b' }, c: 'c', d: 'd' },
      })
    ).toEqual([
      'en-AU "a.b" holds number; expected a string or a nested object',
      'en-AU "c" holds null; expected a string or a nested object',
      'en-AU "d" holds array; expected a string or a nested object',
      'pt-BR has "a.b", which en-AU lacks',
      'pt-BR has "c", which en-AU lacks',
      'pt-BR has "d", which en-AU lacks',
    ]);
  });

  it('reports a catalogue that is not a JSON object', () => {
    expect(localeCatalogueProblems({ 'en-AU': { save: 'Save' }, 'pt-BR': [] })).toEqual([
      'pt-BR catalogue is not a JSON object',
      'pt-BR is missing "save"',
    ]);
  });
});
