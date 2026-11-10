import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import { sameSourceValue } from './source-refresh';

/** A typed semantic buffer preserves incomplete input separately from the producer's valid source shape. */
export class SemanticDraft<Value> {
  private readonly listeners = new Set<() => void>();
  private canonical: Value;
  private value: Value;

  constructor(initial: Value) {
    this.canonical = initial;
    this.value = initial;
  }

  /** Read a stable buffer snapshot. */
  read = (): Value => this.value;

  /** Observe buffer changes independently of the source editor's mounted view. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Replace only explicit user input, including invalid or incomplete values. */
  set = (value: Value): void => {
    if (sameSourceValue(value, this.value)) return;
    this.value = value;
    for (const listener of this.listeners) listener();
  };

  /** Refresh untouched buffers while preserving input that has not converged with the source. */
  receive(value: Value): void {
    const untouched = sameSourceValue(this.value, this.canonical);
    this.canonical = value;
    if (untouched) this.set(value);
  }

  /** Explicitly discard buffered input against an acknowledged canonical source. */
  reset(value: Value): void {
    this.canonical = value;
    this.set(value);
  }
}

/** Bind local or retained semantic input; stale views cannot alter or refresh a retained buffer. */
export function useSemanticDraft<Value>(
  initial: Value,
  retained?: SemanticDraft<Value>,
  isCurrent?: () => boolean
): readonly [Value, (value: Value) => void] {
  const [local] = useState(() => new SemanticDraft(initial));
  const draft = retained ?? local;
  const value = useSyncExternalStore(draft.subscribe, draft.read, draft.read);
  const observed = useRef<{ draft: SemanticDraft<Value>; value: Value } | undefined>(undefined);
  useLayoutEffect(() => {
    if (isCurrent !== undefined && !isCurrent()) return;
    if (observed.current?.draft === draft && sameSourceValue(observed.current.value, initial))
      return;
    observed.current = { draft, value: initial };
    draft.receive(initial);
  });
  return [
    value,
    (next) => {
      if (isCurrent === undefined || isCurrent()) draft.set(next);
    },
  ];
}
