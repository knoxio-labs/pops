import type { EffectiveComputedValue, EvaluatedDependency } from './expression-types.js';

/** The revisioned subject whose disposable computed result may be cached. */
export interface ComputedCacheSubject {
  readonly itemId: string;
  readonly fieldId: string;
  readonly itemRevision: number;
  readonly catalogueRevision: number;
}

interface CacheEntry {
  readonly subject: ComputedCacheSubject;
  readonly value: EffectiveComputedValue;
  readonly dependencies: readonly EvaluatedDependency[];
}

function subjectKey(subject: Pick<ComputedCacheSubject, 'itemId' | 'fieldId'>): string {
  return `${subject.itemId}:${subject.fieldId}`;
}

function dependencyKey(dependency: Pick<EvaluatedDependency, 'itemId' | 'fieldId'>): string {
  return `${dependency.itemId}:${dependency.fieldId}`;
}

function computedDependencies(value: EffectiveComputedValue): readonly EvaluatedDependency[] {
  return value.provenance.source === 'computed' ? value.provenance.dependencies : [];
}

/** A deterministic bounded LRU whose entries are valid only for exact revision vectors. */
export class ComputedValueCache {
  readonly #entries = new Map<string, CacheEntry>();
  readonly #reverse = new Map<string, Set<string>>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1)
      throw new RangeError('computed cache capacity must be a positive integer');
  }

  get(
    subject: ComputedCacheSubject,
    dependencyRevision: (itemId: string, fieldId: string) => number | null
  ): EffectiveComputedValue | undefined {
    const key = subjectKey(subject);
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    if (
      entry.subject.itemRevision !== subject.itemRevision ||
      entry.subject.catalogueRevision !== subject.catalogueRevision ||
      entry.dependencies.some(
        (dependency) =>
          dependencyRevision(dependency.itemId, dependency.fieldId) !== dependency.revision
      )
    ) {
      this.delete(key);
      return undefined;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(subject: ComputedCacheSubject, value: EffectiveComputedValue): void {
    const key = subjectKey(subject);
    this.delete(key);
    const dependencies = computedDependencies(value);
    this.#entries.set(key, { subject, value, dependencies });
    for (const dependency of dependencies) {
      const reverseKey = dependencyKey(dependency);
      const entries = this.#reverse.get(reverseKey) ?? new Set<string>();
      entries.add(key);
      this.#reverse.set(reverseKey, entries);
    }
    const oldest =
      this.#entries.size > this.capacity ? this.#entries.keys().next().value : undefined;
    if (oldest !== undefined) this.delete(oldest);
  }

  invalidateDependency(itemId: string, fieldId: string): void {
    for (const key of this.#reverse.get(dependencyKey({ itemId, fieldId })) ?? []) this.delete(key);
  }

  invalidateItem(itemId: string): void {
    for (const [key, entry] of this.#entries) {
      if (entry.subject.itemId === itemId) this.delete(key);
    }
    for (const dependency of [...this.#reverse.keys()]) {
      if (!dependency.startsWith(`${itemId}:`)) continue;
      for (const key of this.#reverse.get(dependency) ?? []) this.delete(key);
    }
  }

  invalidateCatalogue(catalogueRevision: number): void {
    for (const [key, entry] of this.#entries) {
      if (entry.subject.catalogueRevision === catalogueRevision) this.delete(key);
    }
  }

  clear(): void {
    this.#entries.clear();
    this.#reverse.clear();
  }

  get size(): number {
    return this.#entries.size;
  }

  private delete(key: string): void {
    const entry = this.#entries.get(key);
    if (entry === undefined) return;
    this.#entries.delete(key);
    for (const dependency of entry.dependencies) {
      const reverseKey = dependencyKey(dependency);
      const entries = this.#reverse.get(reverseKey);
      entries?.delete(key);
      if (entries?.size === 0) this.#reverse.delete(reverseKey);
    }
  }
}
