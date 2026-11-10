import type { ContactReferenceReadResult, ContactsHostCapability } from '@pops/pillar-sdk';

/** Read availability remains separate from the persisted Trips association and original URI. */
export type CaptureContactRead = ContactReferenceReadResult | { status: 'unverified' | 'loading' };
const unverified: CaptureContactRead = { status: 'unverified' };

/** Retain deduplicated owner reads per trip/browser session without editing source references or acknowledging writes. */
export class CaptureContactReferenceReads {
  private values = new Map<string, CaptureContactRead>();
  private verified = new Map<
    string,
    Extract<ContactReferenceReadResult, { status: 'available' }>
  >();
  private pending = new Map<string, Promise<void>>();
  private completed = new Set<string>();
  private listeners = new Set<() => void>();
  private version = 0;
  constructor(
    private read?: ContactsHostCapability['readContactReference'],
    private known: (uri: string) => boolean = () => false
  ) {}
  /** Read a stable URI-specific snapshot, including before a host reader is available. */
  snapshot = (uri: string): CaptureContactRead => this.values.get(uri) ?? unverified;
  /** Retain prior owner display facts through a failed refresh without treating them as current availability. */
  lastAvailable = (
    uri: string
  ): Extract<ContactReferenceReadResult, { status: 'available' }> | undefined =>
    this.verified.get(uri);
  /** Observe reads shared by duplicate references and conditionally mounted views. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Stable whole-store subscription for Inbox filters that inspect several owner references. */
  getVersion = (): number => this.version;
  /** Project actual owner presence; chooser bootstrap evidence expires after the first completed owner read. */
  availability = (uri: string): 'available' | 'missing' | 'unverified' => {
    const value = this.snapshot(uri);
    if (value.status === 'available' || value.status === 'missing') return value.status;
    return !this.completed.has(uri) && this.known(uri) ? 'available' : 'unverified';
  };
  /** Load once per retained URI, or explicitly retry a completed read; overlapping views share the same request. */
  load(uri: string, retry = false): Promise<void> {
    const pending = this.pending.get(uri);
    if (pending !== undefined) return pending;
    if (this.read === undefined || (!retry && this.values.has(uri))) return Promise.resolve();
    const read = this.read;
    const result = Promise.resolve().then(async () => {
      try {
        this.publish(uri, await read(uri));
      } catch {
        this.publish(uri, { status: 'unavailable' });
      } finally {
        this.pending.delete(uri);
      }
    });
    this.pending.set(uri, result);
    this.publish(uri, { status: 'loading' });
    return result;
  }
  private publish(uri: string, value: CaptureContactRead): void {
    if (value.status !== 'loading' && value.status !== 'unverified') this.completed.add(uri);
    if (value.status === 'available') this.verified.set(uri, value);
    this.values.set(uri, value);
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}
