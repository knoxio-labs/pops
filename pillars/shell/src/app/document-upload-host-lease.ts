import { uploadHostUnavailable } from './document-upload-host-storage';

import type { UploadPersistenceIdentity, UploadPersistenceLease } from '@pops/pillar-sdk';

import type { DocumentUploadHostState } from './document-upload-host-state';
import type { UploadHostMarker } from './document-upload-host-storage';

function sameIdentity(a: UploadPersistenceIdentity, b: UploadPersistenceIdentity): boolean {
  return a.server === b.server && a.account === b.account && a.epoch === b.epoch;
}

class DocumentUploadHostLease implements UploadPersistenceLease {
  readonly identity: Readonly<UploadPersistenceIdentity>;
  readonly #state: DocumentUploadHostState;
  readonly #prefix: string;
  readonly #verifyAction: () => Promise<UploadPersistenceLease>;

  constructor(
    state: DocumentUploadHostState,
    marker: UploadHostMarker,
    verifyAction: () => Promise<UploadPersistenceLease>
  ) {
    this.#state = state;
    this.#verifyAction = verifyAction;
    this.identity = Object.freeze({
      account: marker.account,
      server: state.server,
      epoch: marker.epoch,
    });
    this.#prefix = `${state.metadata.accountPrefix(this.identity.account)}${JSON.stringify(this.identity.epoch)}:`;
  }

  isCurrent = (): boolean => {
    if (!this.isActive()) return false;
    try {
      if (this.#state.registryUrl() !== this.#state.capturedRegistryUrl) {
        this.#state.requiresFreshVerification = true;
        return false;
      }
      if (this.#state.requiresFreshVerification) return false;
      const actual = this.#state.metadata.readMarker();
      if (actual?.account === this.identity.account && actual.epoch === this.identity.epoch)
        return true;
    } catch {
      this.#state.requiresFreshVerification = true;
      return false;
    }
    return false;
  };

  invalidate = (): void => {
    let marker: UploadHostMarker | null;
    try {
      marker = this.#state.metadata.readMarker();
    } catch {
      this.#state.quarantine();
      throw new Error(uploadHostUnavailable);
    }
    if (marker?.account !== this.identity.account || marker.epoch !== this.identity.epoch) return;
    this.#state.quarantine();
    this.#state.metadata.purge(this.identity.account);
    this.#state.metadata.removeMarker();
    this.#state.observed = null;
  };

  keys = (): string[] =>
    this.access(() => {
      const target = this.#state.metadata.storage();
      const keys: string[] = [];
      for (let index = 0; index < target.length; index += 1) {
        const key = target.key(index);
        if (key?.startsWith(this.#prefix)) keys.push(key.slice(this.#prefix.length));
      }
      return keys;
    });

  read = (key: string): string | null =>
    this.access(() => this.#state.metadata.storage().getItem(this.#prefix + key));

  write = (key: string, value: string): void =>
    this.access(() => {
      this.#state.metadata.storage().setItem(this.#prefix + key, value);
      if (this.#state.metadata.storage().getItem(this.#prefix + key) !== value)
        throw new Error(uploadHostUnavailable);
    });

  remove = (key: string): void =>
    this.access(() => {
      this.#state.metadata.storage().removeItem(this.#prefix + key);
      if (this.#state.metadata.storage().getItem(this.#prefix + key) !== null)
        throw new Error(uploadHostUnavailable);
    });

  verify = async (): Promise<void> => {
    this.assertCurrent();
    const fresh = await this.#verifyAction();
    if (!sameIdentity(fresh.identity, this.identity)) throw new Error(uploadHostUnavailable);
    this.assertCurrent();
  };

  private isActive(): boolean {
    return this.#state.active !== null && sameIdentity(this.#state.active.identity, this.identity);
  }

  private assertCurrent(): void {
    if (this.isCurrent()) return;
    if (this.isActive()) this.#state.quarantine();
    throw new Error(uploadHostUnavailable);
  }

  private access<Value>(action: () => Value): Value {
    this.assertCurrent();
    try {
      const value = action();
      this.assertCurrent();
      return value;
    } catch {
      if (this.isActive()) this.#state.quarantine();
      throw new Error(uploadHostUnavailable);
    }
  }
}

/** Expose only scoped metadata operations while retaining authority state inside the host. */
export function createDocumentUploadHostLease(
  state: DocumentUploadHostState,
  marker: UploadHostMarker,
  verifyAction: () => Promise<UploadPersistenceLease>
): UploadPersistenceLease {
  const lease = new DocumentUploadHostLease(state, marker, verifyAction);
  return {
    identity: lease.identity,
    isCurrent: lease.isCurrent,
    invalidate: lease.invalidate,
    keys: lease.keys,
    read: lease.read,
    write: lease.write,
    remove: lease.remove,
    verify: lease.verify,
  };
}
