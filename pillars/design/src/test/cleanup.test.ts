/**
 * Regression for POPS-2806: this project sets no `globals`, so React Testing
 * Library only unmounts what a test rendered if something calls its
 * `afterEach` — which nothing did before `src/test-setup.ts` added one. A
 * hook mounted in one test kept handling events (and touching `document`)
 * in every test after it in the same file.
 *
 * This pins the fix at the level the bug actually showed up: two tests in
 * one file, a `document` listener mounted in the first, and the second
 * proving it is gone.
 */
import { renderHook } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';

let fires = 0;

function useDocumentListener(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onMove = (): void => {
      fires += 1;
      setTick((n) => n + 1);
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, []);
}

describe('per-test cleanup', () => {
  it('mounts a hook that listens on document', () => {
    renderHook(() => useDocumentListener());
    document.dispatchEvent(new MouseEvent('mousemove'));
    expect(fires).toBe(1);
  });

  it('does not still have the previous test’s listener attached', () => {
    document.dispatchEvent(new MouseEvent('mousemove'));
    // Unchanged from the previous test: without cleanup between tests, the
    // still-mounted hook from above answers this too and fires would be 2.
    expect(fires).toBe(1);
  });
});
