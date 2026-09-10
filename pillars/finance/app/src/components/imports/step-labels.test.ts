import { renderHook } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { initialState } from '../../store/import-store-types';
import { useImportStore } from '../../store/importStore';
import {
  firstImportStep,
  IMPORT_STEP_COUNT,
  IMPORT_STEP_KEYS,
  importStepLabel,
  importStepsFor,
} from './step-labels';

import type { TFunction } from 'i18next';

const t: TFunction<'finance'> = renderHook(() => useTranslation('finance')).result.current.t;

describe('importStepsFor', () => {
  it('a file run has every step; a live draft starts at Process', () => {
    expect(importStepsFor(null)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(importStepsFor({ kind: 'file', dialectId: 'Amex', fileNames: ['a.csv'] })).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(importStepsFor({ kind: 'live', provider: 'up' })).toEqual([3, 4, 5, 6, 7, 8]);
    expect(firstImportStep({ kind: 'live', provider: 'up' })).toBe(3);
  });

  it('labels steps by number and nothing for an unknown one', () => {
    expect(importStepLabel(4, t)).toBe('Review');
    expect(importStepLabel(null, t)).toBeNull();
    expect(importStepLabel(9, t)).toBeNull();
  });
});

/**
 * One list of keys behind both callers.
 *
 * The indicator used to render a parallel array of English literals while the
 * pending-import card resolved through `t`, so a pt-BR session read the eight
 * step names untranslated in the middle of a translated page, and the two
 * surfaces could name one step differently (POPS-3351).
 */
describe('the step keys', () => {
  it('has one key per step component the wizard mounts', () => {
    expect(IMPORT_STEP_COUNT).toBe(IMPORT_STEP_KEYS.length);
    expect(IMPORT_STEP_KEYS).toHaveLength(8);
  });

  it('resolves every step to a translation rather than to its own key', () => {
    for (const step of importStepsFor(null)) {
      const label = importStepLabel(step, t);
      expect(label, `step ${String(step)}`).not.toBeNull();
      // `t` hands back the key when nothing is registered for it, which is
      // what an untranslated step looks like rather than a missing one.
      expect(label, `step ${String(step)}`).not.toMatch(/^import\.pending\.step\./u);
    }
  });

  it('names a live draft’s first shown step Process, not Upload', () => {
    const live = importStepsFor({ kind: 'live', provider: 'up' });

    expect(importStepLabel(live[0] ?? 0, t)).toBe('Process');
  });
});

describe("the store never goes back past a live draft's first step", () => {
  it('Back from Process stays on Process for a live draft and reaches Map for a file draft', () => {
    useImportStore.setState({
      ...initialState,
      currentStep: 3,
      draftSource: { kind: 'live', provider: 'up' },
    });
    useImportStore.getState().prevStep();
    expect(useImportStore.getState().currentStep).toBe(3);
    useImportStore.getState().goToStep(1);
    expect(useImportStore.getState().currentStep).toBe(3);

    useImportStore.setState({ ...initialState, currentStep: 3 });
    useImportStore.getState().prevStep();
    expect(useImportStore.getState().currentStep).toBe(2);
  });
});
