import { useState } from 'react';

import { fieldProblem, fieldValuePatch, refusalText } from './fact-editing-validation';

import type { FieldValuePatch } from '../../inventory-web/commands';
import type { VerbResult } from '../../inventory-web/item-verbs';
import type { FieldDrafts, FormFieldDef } from '../item-form/field-model';

/** The state and operations managed by one-at-a-time fact editing. */
export interface FactEditingState {
  phaseOf: (key: string) => 'idle' | 'editing' | 'saving' | 'pending' | 'rejected';
  drafts: FieldDrafts;
  rejection: { key: string; reason: string } | null;
  problem: string | null;
  fieldOf: (key: string) => FormFieldDef | null;
  start: (key: string) => void;
  change: (drafts: FieldDrafts) => void;
  save: () => void;
  revert: () => void;
}

/** Inputs required by the inline fact state machine. */
export interface FactEditingStateInput {
  itemId: string;
  fields: readonly FormFieldDef[];
  initialDrafts: FieldDrafts;
  pendingItemIds: ReadonlySet<string>;
  editValues: (patches: readonly FieldValuePatch[]) => Promise<VerbResult>;
}

interface FactEditingSetters {
  setDrafts: (drafts: FieldDrafts) => void;
  setActiveKey: (key: string | null) => void;
  setPhase: (phase: FactPhase) => void;
  setRejection: (value: { key: string; reason: string } | null) => void;
  setProblem: (value: string | null) => void;
}

type FactPhase = FactEditingState['phaseOf'] extends (key: string) => infer Phase ? Phase : never;

function createFieldOf(fields: readonly FormFieldDef[]): (key: string) => FormFieldDef | null {
  return (key): FormFieldDef | null => {
    const field = fields.find((candidate) => candidate.key === key) ?? null;
    return field?.storage === 'stored' ? field : null;
  };
}

function createStart(
  fieldOf: (key: string) => FormFieldDef | null,
  initialDrafts: FieldDrafts,
  setters: FactEditingSetters
): (key: string) => void {
  return (key): void => {
    if (fieldOf(key) === null) return;
    setters.setDrafts(initialDrafts);
    setters.setActiveKey(key);
    setters.setPhase('editing');
    setters.setRejection(null);
    setters.setProblem(null);
  };
}

interface SaveContext {
  input: FactEditingStateInput;
  activeKey: string | null;
  drafts: FieldDrafts;
  fieldOf: (key: string) => FormFieldDef | null;
  initialDrafts: FieldDrafts;
  setters: FactEditingSetters;
}

function createSave(context: SaveContext): () => void {
  return (): void => {
    if (context.activeKey === null) return;
    const field = context.fieldOf(context.activeKey);
    if (field === null) return;
    const nextProblem = fieldProblem(field, context.drafts);
    if (nextProblem !== null) {
      context.setters.setProblem(nextProblem);
      return;
    }

    const key = context.activeKey;
    const phase = context.input.pendingItemIds.has(context.input.itemId) ? 'pending' : 'saving';
    context.setters.setPhase(phase);
    context.setters.setProblem(null);
    context.setters.setRejection(null);
    void context.input
      .editValues([fieldValuePatch(context.drafts, field)])
      .then((result) => {
        if (result.status === 'refused') {
          context.setters.setDrafts(context.initialDrafts);
          context.setters.setActiveKey(key);
          context.setters.setPhase('rejected');
          context.setters.setRejection({ key, reason: refusalText(result.refusal) });
          return;
        }
        context.setters.setActiveKey(null);
        context.setters.setPhase('idle');
        context.setters.setRejection(null);
      })
      .catch((error: unknown) => {
        context.setters.setDrafts(context.initialDrafts);
        context.setters.setActiveKey(key);
        context.setters.setPhase('rejected');
        context.setters.setRejection({
          key,
          reason:
            error instanceof Error
              ? error.message
              : 'The inventory service could not save this change.',
        });
      });
  };
}

/** Provides the editable-field state machine used by the item-detail hook. */
export function useFactEditingState(input: FactEditingStateInput): FactEditingState {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<FactPhase>('idle');
  const [drafts, setDrafts] = useState(input.initialDrafts);
  const [rejection, setRejection] = useState<{ key: string; reason: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const fieldOf = createFieldOf(input.fields);
  const phaseOf = (key: string): FactPhase => (activeKey === key ? phase : 'idle');
  const setters: FactEditingSetters = {
    setDrafts,
    setActiveKey,
    setPhase,
    setRejection,
    setProblem,
  };
  const start = createStart(fieldOf, input.initialDrafts, setters);
  const change = (next: FieldDrafts): void => {
    setDrafts(next);
    setProblem(null);
  };
  const revert = (): void => {
    setDrafts(input.initialDrafts);
    setActiveKey(null);
    setPhase('idle');
    setRejection(null);
    setProblem(null);
  };
  const save = createSave({
    input,
    activeKey,
    drafts,
    fieldOf,
    initialDrafts: input.initialDrafts,
    setters,
  });

  return { phaseOf, drafts, rejection, problem, fieldOf, start, change, save, revert };
}
