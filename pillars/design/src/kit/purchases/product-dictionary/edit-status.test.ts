import { editStatusMessage } from '@/kit/purchases/product-dictionary/edit-status';
import { describe, expect, it } from 'vitest';

describe('editStatusMessage', () => {
  it('is empty before any correction has been applied', () => {
    expect(editStatusMessage(null)).toBe('');
  });

  it('reports the server message on a failed correction', () => {
    expect(editStatusMessage({ kind: 'merge', status: 'error', message: 'network down' })).toBe(
      'That correction did not stick: network down'
    );
  });

  it('falls back to an empty explanation when the server sent none', () => {
    expect(editStatusMessage({ kind: 'merge', status: 'error', message: null })).toBe(
      'That correction did not stick: '
    );
  });

  // The wordings themselves, not merely that one exists: what each correction
  // says it did is the whole reason the status line is there, and a length
  // check passes just as happily with two of them swapped.
  it.each([
    ['merge', 'Pointed at that product.'],
    ['split', 'Given a product of its own again.'],
    ['assert', 'Asserted.'],
    ['retract', 'Retracted.'],
    ['forgetWording', 'Wording forgotten.'],
    ['forgetWordingWithProduct', 'Wording forgotten, and the product it was the last one reaching'],
    ['rename', 'Renamed.'],
    ['forgetProduct', 'Product forgotten, and every wording with it.'],
  ] as const)('says what a %s did', (kind, opening) => {
    expect(editStatusMessage({ kind, status: 'ok', message: null })).toContain(opening);
  });

  it('never gives two corrections the same wording', () => {
    const kinds = [
      'merge',
      'split',
      'assert',
      'retract',
      'forgetWording',
      'forgetWordingWithProduct',
      'rename',
      'forgetProduct',
    ] as const;
    const messages = kinds.map((kind) => editStatusMessage({ kind, status: 'ok', message: null }));
    expect(new Set(messages).size).toBe(kinds.length);
  });

  it('gives forgetting a named product its own wording, distinct from an ordinary forget', () => {
    const ordinary = editStatusMessage({ kind: 'forgetWording', status: 'ok', message: null });
    const withProduct = editStatusMessage({
      kind: 'forgetWordingWithProduct',
      status: 'ok',
      message: null,
    });
    expect(withProduct).not.toBe(ordinary);
  });
});
