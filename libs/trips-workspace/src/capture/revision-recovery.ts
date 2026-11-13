import { captureRevisionConflict } from './failure';
import { sameFields } from './record-field-match';
import { sourceBelongsToTrip } from './result';

import type {
  CaptureConflictReload,
  CaptureEditorState,
  CaptureFailure,
  CaptureIntent,
} from './editor-types';
import type { CaptureCommand, CaptureSource } from './types';

type RowEdit = Extract<CaptureCommand, { kind: 'capture.update' | 'idea.update' }>;
type RowKey = `${number}:${RowEdit['kind']}:${number}`;
type RowConflict = {
  readonly operationId: string;
  readonly command: RowEdit;
  readonly intent: CaptureIntent;
  readonly failure: CaptureFailure;
  readonly read: { readonly token: CaptureConflictReload; readonly row: SourceRow } | null;
};
type SourceRow = CaptureSource['captures'][number] | CaptureSource['ideas'][number];
interface RecoveryHost {
  readonly tripId: number;
  readonly state: CaptureEditorState;
  readonly pending: CaptureIntent | null;
  failureIntent: CaptureIntent | null;
  receive(source: CaptureSource, generation: number): void;
  publish(update: Partial<CaptureEditorState>): void;
}

/** Owner-scoped editor conflicts are keyed by owning trip, record kind and ID until explicit row discard. */
export class CaptureRevisionRecovery {
  private sequence = 0;
  private sourceVersion = 0;
  private conflicts = new Map<RowKey, RowConflict>();
  constructor(private host: RecoveryHost) {}

  /** Retain the exact definite rejection independently from another row's transient operation outcome. */
  retainConflict(intent: CaptureIntent, failure: CaptureFailure): void {
    if (!captureRevisionConflict(failure.error, intent)) return;
    const request = structuredClone(intent.request);
    const command = request.command;
    if (command.kind !== 'capture.update' && command.kind !== 'idea.update') return;
    const key = this.key(command.kind, command.id);
    if (this.conflicts.has(key)) return;
    this.conflicts.set(key, {
      operationId: intent.request.operationId,
      command,
      intent: { ...intent, request },
      failure: { ...failure },
      read: null,
    });
  }
  /** Restore an unresolved row's existing controls after a confirmed unrelated operation, without dispatch. */
  restoreConflict(): CaptureFailure | null {
    const conflict = this.conflicts.values().next().value;
    this.host.failureIntent = conflict?.intent ?? null;
    return conflict?.failure ?? null;
  }

  /** Count only source reads admitted by the owning editor, including equal-revision field changes. */
  acceptedRead(): void {
    this.sourceVersion += 1;
  }

  /** Start a fresh explicit read after a definite row rejection, never an ambiguous write. */
  beginConflictReload(): CaptureConflictReload | null {
    const conflict = this.rowConflict();
    if (conflict === null || this.host.state.busy || this.host.pending !== null) return null;
    this.conflicts.set(this.key(conflict.command.kind, conflict.command.id), {
      ...conflict,
      read: null,
    });
    return {
      operationId: conflict.operationId,
      generation: this.host.state.generation,
      readId: ++this.sequence,
      sourceVersion: this.sourceVersion,
    };
  }
  /** Admit current canonical proof without discarding any fields or rebasing their precondition. */
  completeConflictReload(token: CaptureConflictReload, source: CaptureSource): boolean {
    const conflict = this.currentReload(token);
    if (conflict === null || !sourceBelongsToTrip(source, this.host.tripId)) return false;
    const row = this.editRow(source, conflict.command);
    if (
      row === undefined ||
      row.removedAt !== null ||
      row.revision < conflict.command.expectedRevision
    )
      return false;
    this.host.receive(source, token.generation);
    if (
      this.sourceVersion !== token.sourceVersion + 1 ||
      !sameFields(this.host.state.source, source)
    )
      return false;
    this.conflicts.set(this.key(conflict.command.kind, conflict.command.id), {
      ...conflict,
      read: { token: { ...token }, row: structuredClone(row) },
    });
    this.host.publish({});
    return true;
  }
  /** Retain unknown writes and require this exact rejected row's current fresh proof before discard. */
  canDiscardRejectedEdit(kind: 'capture' | 'idea', id: number): boolean {
    if (this.pendingEdit(kind, id)) return false;
    const conflict = this.conflicts.get(this.key(`${kind}.update`, id));
    if (conflict === undefined) return true;
    const read = conflict.read;
    return (
      read !== null &&
      read.token.operationId === conflict.operationId &&
      read.token.generation === this.host.state.generation &&
      sameFields(this.editRow(this.host.state.source, conflict.command), read.row)
    );
  }
  /** Clear only the matching definitely rejected intent after an explicit permitted row discard. */
  discardRejectedEdit(kind: 'capture' | 'idea', id: number): boolean {
    if (!this.canDiscardRejectedEdit(kind, id)) return false;
    const key = this.key(`${kind}.update`, id);
    const conflict = this.conflicts.get(key);
    if (conflict === undefined) return true;
    this.conflicts.delete(key);
    if (this.host.failureIntent?.request.operationId === conflict.operationId) {
      const failure = this.restoreConflict();
      this.host.publish({ failure });
    }
    return true;
  }
  /** Stop same-row autosave until explicit recovery discards that rejected draft. */
  blocksConflictedEdit(command: CaptureCommand): boolean {
    return (
      (command.kind === 'capture.update' || command.kind === 'idea.update') &&
      this.conflicts.has(this.key(command.kind, command.id))
    );
  }
  private currentReload(token: CaptureConflictReload): RowConflict | null {
    const conflict = this.rowConflict();
    if (
      conflict === null ||
      conflict.operationId !== token.operationId ||
      this.host.state.busy ||
      this.host.pending !== null ||
      token.generation !== this.host.state.generation ||
      token.readId !== this.sequence ||
      token.sourceVersion !== this.sourceVersion
    )
      return null;
    return conflict;
  }
  private pendingEdit(kind: 'capture' | 'idea', id: number): boolean {
    const command = this.host.pending?.request.command;
    return (
      (command?.kind === 'capture.update' || command?.kind === 'idea.update') &&
      command.kind === `${kind}.update` &&
      command.id === id
    );
  }
  private rowConflict(): RowConflict | null {
    const intent = this.host.failureIntent;
    const command = intent?.request.command;
    if (command?.kind !== 'capture.update' && command?.kind !== 'idea.update') return null;
    const conflict = this.conflicts.get(this.key(command.kind, command.id));
    return conflict !== undefined && conflict.operationId === intent?.request.operationId
      ? conflict
      : null;
  }
  private key(kind: RowEdit['kind'], id: number): RowKey {
    return `${this.host.tripId}:${kind}:${id}`;
  }
  private editRow(source: CaptureSource, command: RowEdit): SourceRow | undefined {
    return command.kind === 'capture.update'
      ? source.captures.find((row) => row.id === command.id)
      : source.ideas.find((row) => row.id === command.id);
  }
}
