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

  it('reports the outcome wording for every successful correction kind', () => {
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
    for (const kind of kinds) {
      const message = editStatusMessage({ kind, status: 'ok', message: null });
      expect(message.length).toBeGreaterThan(0);
    }
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
