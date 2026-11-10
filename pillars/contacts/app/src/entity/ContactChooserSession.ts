import { ContactError } from '../errors';

import type { Entity } from '../contacts-api/types.gen';
import type { ContactCreationGateway, ContactSelection } from './api';

/** Retained owner state for one creation intent, including the no-repeat guard after an unknown outcome. */
export interface ContactChooserSnapshot {
  readonly name: string;
  readonly selectedType: string | null;
  readonly busy: boolean;
  readonly created: Entity | null;
  readonly uncertain: boolean;
  readonly error: ContactError | null;
}

/** Contacts-owned creation intent; retain one instance outside route views and replace only for a new explicit intent. */
export class ContactChooserSession {
  private state: ContactChooserSnapshot = {
    name: '',
    selectedType: null,
    busy: false,
    created: null,
    uncertain: false,
    error: null,
  };
  private listeners = new Set<() => void>();

  /** Read the stable immutable snapshot used by React's external-store subscription. */
  snapshot = (): ContactChooserSnapshot => this.state;

  /** Subscribe to draft and asynchronous creation outcome updates, including updates while no view is mounted. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private update(patch: Partial<ContactChooserSnapshot>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Change an editable draft; a submitted or uncertain creation cannot be rewritten into another POST. */
  setName = (name: string): void => {
    if (!this.locked()) this.update({ name });
  };

  /** Persist an explicit source-catalogue choice without replacing it when catalogue defaults change. */
  setType = (selectedType: string): void => {
    if (!this.locked()) this.update({ selectedType });
  };

  /** Initialize the name from search only before this intent already has a draft or creation outcome. */
  start = (name: string): void => {
    if (!this.state.name) this.setName(name);
  };

  private locked() {
    return this.state.busy || this.state.created !== null || this.state.uncertain;
  }

  /** Submit once; a known entity retries resolution only, and an ambiguous POST outcome permanently fences this intent. */
  async submit(gateway: ContactCreationGateway, type: string): Promise<ContactSelection | null> {
    if (this.state.busy || this.state.uncertain || !this.state.name.trim()) return null;
    this.update({ busy: true, error: null });
    try {
      const created = this.state.created ?? (await this.create(gateway, type));
      if (!created) return null;
      return await gateway.resolve(created.id);
    } catch (failure) {
      this.update({ error: safeError(failure) });
      return null;
    } finally {
      this.update({ busy: false });
    }
  }

  private async create(gateway: ContactCreationGateway, type: string): Promise<Entity | null> {
    try {
      const entity = await gateway.create(this.state.name.trim(), type);
      if (!entity || typeof entity.id !== 'string' || !entity.id.trim())
        throw new ContactError('invalidResponse', 'contacts.create.identity');
      this.update({ created: entity });
      return entity;
    } catch (failure) {
      const error = safeError(failure);
      const definite = [
        'invalidRequest',
        'unauthorized',
        'forbidden',
        'notFound',
        'stale',
        'tooLarge',
      ];
      this.update({ error, uncertain: !definite.includes(error.messageKey) });
      return null;
    }
  }
}

function safeError(failure: unknown): ContactError {
  return failure instanceof ContactError
    ? failure
    : new ContactError('saveFailed', 'contacts.create.failed');
}
