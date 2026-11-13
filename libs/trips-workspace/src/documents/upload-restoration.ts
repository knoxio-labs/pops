/** Cached restoration result for one retained session and exact journal binding. */
export interface UploadRestorationSnapshot {
  readonly binding: string | null;
  readonly error: string | null;
}

const pending: UploadRestorationSnapshot = Object.freeze({ binding: null, error: null });

/** Session-owned restoration outcomes; this coordinator never owns Files, commands or receipts. */
export class UploadRestoration {
  private readonly outcomes = new Map<string, UploadRestorationSnapshot>();

  constructor(private readonly notify: () => void) {}

  /** Pure stable snapshots; absent or unseen authority never borrows another binding's result. */
  readonly readFor = (binding: string | null): UploadRestorationSnapshot =>
    binding === null ? pending : (this.outcomes.get(binding) ?? pending);

  /** Always retry the real owner restoration and publish its result; original failures still throw. */
  run(binding: string, restore: () => void, fallback: string): void {
    try {
      restore();
      this.publish(binding, null);
    } catch (error) {
      this.publish(binding, error instanceof Error ? error.message : fallback);
      throw error;
    }
  }

  private publish(binding: string, error: string | null): void {
    const before = this.outcomes.get(binding);
    if (before !== undefined && before.error === error) return;
    this.outcomes.set(binding, Object.freeze({ binding, error }));
    this.notify();
  }
}
