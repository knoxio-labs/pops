import type {
  FactReceipt,
  FactsSnapshot,
  SourceAccount,
  SourceRecord,
} from '../contacts-api/types.gen';
import type { PersonDraft } from './draft';

/** Atomic Contacts-owned person facts, retaining original observations and source provenance. */
export interface PersonSnapshot extends FactsSnapshot {
  sources: SourceRecord[];
  accounts: SourceAccount[];
}

/** Generated HTTP boundary; explicit mutations and undo are never replayed automatically. */
export interface PersonGateway {
  load: (id: string) => Promise<PersonSnapshot>;
  save: (id: string, draft: PersonDraft, before: PersonSnapshot) => Promise<FactReceipt>;
  undo: (id: string, operationId: string, version: number) => Promise<FactReceipt>;
}
