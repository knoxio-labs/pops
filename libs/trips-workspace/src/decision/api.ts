import { unwrap } from '@pops/pillar-sdk/client';

import {
  decisionsWorkspace,
  decisionsUpdate,
  decisionsSelect,
  decisionOptionsCreate,
  decisionOptionsUpdate,
  decisionOptionsDelete,
  decisionOptionsRestore,
} from '../trips-api/sdk.gen';
import {
  previousDecisionFields,
  previousOptionFields,
  requireOption,
  savedOption,
  removedOption,
} from './model';

import type {
  AppliedDecisionChange,
  DecisionSource,
  DecisionWorkspaceProps,
  UndoCommand,
} from './types';

/** Load the aggregate from one producer transaction, retaining unresolved source references. */
export async function loadDecision(
  props: DecisionWorkspaceProps,
  signal?: AbortSignal
): Promise<DecisionSource> {
  return unwrap(
    decisionsWorkspace({
      client: props.client,
      path: { tripId: props.tripId, id: props.decisionId },
      signal,
    })
  );
}
/** Source cache key includes the explicit API origin and owning identities. */
export function decisionQueryKey(
  props: DecisionWorkspaceProps
): readonly ['trips', string, number, 'decision', number] {
  return [
    'trips',
    props.client?.getConfig().baseUrl ?? '/trips-api',
    props.tripId,
    'decision',
    props.decisionId,
  ];
}
/** Execute one guarded source mutation; only a confirmed response produces an inverse or successor revision. */
export async function applyDecisionCommand(
  props: DecisionWorkspaceProps,
  source: DecisionSource,
  command: UndoCommand
): Promise<AppliedDecisionChange> {
  const path = { tripId: props.tripId, id: props.decisionId };
  const expectedRevision = source.decision.revision;
  if (command.kind === 'edit-decision') {
    const decision = unwrap(
      await decisionsUpdate({
        client: props.client,
        path,
        body: { ...command.fields, expectedRevision },
      })
    );
    return {
      source: { ...source, decision },
      inverse: { kind: command.kind, fields: previousDecisionFields(source, command.fields) },
    };
  }
  if (command.kind === 'select-option') {
    const decision = unwrap(
      await decisionsSelect({
        client: props.client,
        path,
        body: { optionId: command.optionId, expectedRevision },
      })
    );
    return {
      source: { ...source, decision },
      inverse: { kind: command.kind, optionId: source.decision.selectedOptionId },
    };
  }
  return applyOptionCommand(props, source, command);
}

async function applyOptionCommand(
  props: DecisionWorkspaceProps,
  source: DecisionSource,
  command: Exclude<UndoCommand, { kind: 'edit-decision' | 'select-option' }>
): Promise<AppliedDecisionChange> {
  const path = { tripId: props.tripId, decisionId: props.decisionId };
  const expectedRevision = source.decision.revision;
  if (command.kind === 'add-option') {
    const option = unwrap(
      await decisionOptionsCreate({
        client: props.client,
        path,
        body: { ...command.fields, expectedRevision },
      })
    );
    return {
      source: savedOption(source, option),
      inverse: { kind: 'remove-option', id: option.id },
    };
  }
  if (command.kind === 'edit-option') {
    const previous = requireOption(source, command.id);
    const option = unwrap(
      await decisionOptionsUpdate({
        client: props.client,
        path: { ...path, id: command.id },
        body: { ...command.fields, expectedRevision },
      })
    );
    return {
      source: savedOption(source, option),
      inverse: {
        kind: command.kind,
        id: option.id,
        fields: previousOptionFields(previous, command.fields),
      },
    };
  }
  if (command.kind === 'restore-option') {
    const option = unwrap(
      await decisionOptionsRestore({
        client: props.client,
        path: { ...path, id: command.id },
        body: { select: command.select, expectedRevision },
      })
    );
    return { source: savedOption(source, option, command.select), inverse: null };
  }
  return removeOption(props, source, command.id);
}

async function removeOption(
  props: DecisionWorkspaceProps,
  source: DecisionSource,
  id: number
): Promise<AppliedDecisionChange> {
  await unwrap(
    decisionOptionsDelete({
      client: props.client,
      path: { tripId: props.tripId, decisionId: props.decisionId, id },
      body: { expectedRevision: source.decision.revision },
    }).then((result) => ({ ...result, data: result.response?.status === 204 ? true : undefined }))
  );
  return {
    source: removedOption(source, id),
    inverse: {
      kind: 'restore-option',
      id,
      select: source.decision.selectedOptionId === id,
    },
  };
}
