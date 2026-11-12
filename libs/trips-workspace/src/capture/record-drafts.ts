import { sameFields } from './record-field-match';
import { ownRecordSuccessor } from './record-successor';

import type { CaptureEditor } from './editor-types';
import type {
  Capture,
  CaptureCommand,
  CaptureSource,
  CaptureTargetInput,
  CaptureResult,
} from './types';

type CapturePatch = Extract<CaptureCommand, { kind: 'capture.update' }>['input'];
type IdeaInput = Extract<CaptureCommand, { kind: 'idea.update' }>['input'];
type Idea = CaptureSource['ideas'][number];
/** Retained row edit preconditions never borrow a revision from a later source read. */
export interface CaptureRecordDraft {
  revision: number;
  input: CapturePatch;
}
/** Idea drafts preserve optional input absence and adopt only a proven own successor revision. */
export interface IdeaRecordDraft {
  revision: number;
  input: IdeaInput;
}
/** Explicit organisation intent survives failures and view filtering without modifying its raw source. */
export interface OrganisationDraft {
  revision: number;
  target: CaptureTargetInput;
}

/** Browser-session row edits and organisation choices, independent of the shared raw composer. */
export class CaptureRecordDrafts {
  private captures = new Map<number, CaptureRecordDraft>();
  private ideas = new Map<number, IdeaRecordDraft>();
  private organisations = new Map<number, OrganisationDraft>();
  private listeners = new Set<() => void>();
  private version = 0;
  constructor(private editor: CaptureEditor) {
    editor.subscribe(() => this.acceptConfirmation());
  }
  /** Observe retained field changes across conditionally mounted row views. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Stable primitive subscription snapshot. */
  getVersion = (): number => this.version;
  /** Read only explicitly edited fields and their original source revision. */
  capture(id: number): CaptureRecordDraft | undefined {
    return this.captures.get(id);
  }
  /** Read an Idea's retained partial edit. */
  idea(id: number): IdeaRecordDraft | undefined {
    return this.ideas.get(id);
  }
  /** Read the explicit target choice without resolving its name or owner. */
  organisation(id: number): OrganisationDraft | undefined {
    return this.organisations.get(id);
  }
  /** Start an edit with the then-current source precondition; subsequent reads cannot rebase it. */
  editCapture(row: Capture, input: CapturePatch): void {
    const before = this.captures.get(row.id);
    this.captures.set(row.id, {
      revision: before?.revision ?? row.revision,
      input: { ...before?.input, ...input },
    });
    this.changed();
  }
  /** Preserve only explicit Idea field changes, including nullable clears. */
  editIdea(row: Idea, input: IdeaInput): void {
    const before = this.ideas.get(row.id);
    this.ideas.set(row.id, {
      revision: before?.revision ?? row.revision,
      input: { ...before?.input, ...input },
    });
    this.changed();
  }
  /** Retain a finite typed target; selecting a classification alone never organises a capture. */
  chooseTarget(row: Capture, target: CaptureTargetInput): void {
    this.organisations.set(row.id, {
      revision: this.organisations.get(row.id)?.revision ?? row.revision,
      target,
    });
    this.changed();
  }
  /** Save the exact retained fields and keep them if the producer rejects or cannot confirm the request. */
  async saveCapture(id: number): Promise<boolean> {
    const draft = this.captures.get(id);
    if (draft === undefined) return false;
    const saved = await this.editor.commit(
      { kind: 'capture.update', id, expectedRevision: draft.revision, input: draft.input },
      'Edit capture'
    );
    return saved;
  }
  /** Persist an explicit Idea edit through its owning revision guard. */
  async saveIdea(id: number): Promise<boolean> {
    const draft = this.ideas.get(id);
    if (draft === undefined) return false;
    const saved = await this.editor.commit(
      { kind: 'idea.update', id, expectedRevision: draft.revision, input: draft.input },
      'Edit Idea'
    );
    return saved;
  }
  /** Create or associate a target atomically while preserving the raw Capture identity. */
  async organise(id: number): Promise<boolean> {
    const draft = this.organisations.get(id);
    if (draft?.target === undefined) return false;
    const saved = await this.editor.commit(
      { kind: 'capture.organise', id, expectedRevision: draft.revision, target: draft.target },
      'Organise'
    );
    return saved;
  }
  /** Explicitly discard only this row's unsaved fields, retaining all source records and other drafts. */
  discard(kind: 'capture' | 'idea' | 'organisation', id: number): void {
    if (kind !== 'organisation' && !this.editor.discardRejectedEdit(kind, id)) return;
    if (kind === 'capture') this.captures.delete(id);
    else if (kind === 'idea') this.ideas.delete(id);
    else this.organisations.delete(id);
    this.changed();
  }
  private changed(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
  private acceptConfirmation(): void {
    const confirmation = this.editor.getState().confirmation;
    if (confirmation === null || confirmation.result.undone) return;
    const command = confirmation.request.command;
    if (command.kind === 'capture.update') this.acceptCapture(command, confirmation.result);
    else if (command.kind === 'idea.update') this.acceptIdea(command, confirmation.result);
    else if (command.kind === 'capture.organise') {
      const draft = this.organisations.get(command.id);
      if (
        draft?.revision === command.expectedRevision &&
        sameFields(draft.target, command.target)
      ) {
        this.organisations.delete(command.id);
        this.changed();
      }
    }
  }
  private acceptCapture(
    command: Extract<CaptureCommand, { kind: 'capture.update' }>,
    result: CaptureResult
  ): void {
    const draft = this.captures.get(command.id);
    const row = ownRecordSuccessor({
      revision: command.expectedRevision,
      input: command.input,
      receipt: result.receipt.captures.find((value) => value.id === command.id),
      current: result.current.captures.find((value) => value.id === command.id),
      tripId: this.editor.getState().source.captures.find((value) => value.id === command.id)
        ?.tripId,
    });
    if (draft?.revision !== command.expectedRevision || row === undefined) return;
    if (sameFields(draft.input, command.input)) this.captures.delete(command.id);
    else this.captures.set(command.id, { ...draft, revision: row.revision });
    this.changed();
  }
  private acceptIdea(
    command: Extract<CaptureCommand, { kind: 'idea.update' }>,
    result: CaptureResult
  ): void {
    const draft = this.ideas.get(command.id);
    const row = ownRecordSuccessor({
      revision: command.expectedRevision,
      input: command.input,
      receipt: result.receipt.ideas.find((value) => value.id === command.id),
      current: result.current.ideas.find((value) => value.id === command.id),
      tripId: this.editor.getState().source.ideas.find((value) => value.id === command.id)?.tripId,
    });
    if (draft?.revision !== command.expectedRevision || row === undefined) return;
    if (sameFields(draft.input, command.input)) this.ideas.delete(command.id);
    else this.ideas.set(command.id, { ...draft, revision: row.revision });
    this.changed();
  }
}
