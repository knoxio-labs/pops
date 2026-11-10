import { ApiError } from '@pops/pillar-sdk/client';

import type { DecisionFields, OptionFields, DecisionSource, DecisionOption } from './types';

/** Capture only the decision fields explicitly replaced by this edit. */
export function previousDecisionFields(
  source: DecisionSource,
  fields: DecisionFields
): DecisionFields {
  return {
    question: fields.question === undefined ? undefined : source.decision.question,
    deadline: fields.deadline === undefined ? undefined : source.decision.deadline,
    notes: fields.notes === undefined ? undefined : source.decision.notes,
    sourceLinks: fields.sourceLinks === undefined ? undefined : source.decision.sourceLinks,
  };
}
/** Capture only the option fields explicitly replaced by this edit. */
export function previousOptionFields(option: DecisionOption, fields: OptionFields): OptionFields {
  return {
    title: fields.title === undefined ? undefined : option.title,
    notes: fields.notes === undefined ? undefined : option.notes,
    affectedSources: fields.affectedSources === undefined ? undefined : option.affectedSources,
    sourceLinks: fields.sourceLinks === undefined ? undefined : option.sourceLinks,
  };
}
/** Require a currently known option before recording its field inverse. */
export function requireOption(source: DecisionSource, id: number): DecisionOption {
  const option = source.options.find((candidate) => candidate.id === id);
  if (!option)
    throw new ApiError({
      code: 'trips.option.unavailable',
      kind: 'client',
      message: 'This option is unavailable. Reload the source before editing it.',
      retryable: false,
    });
  return option;
}
/** Apply a confirmed option write using the producer's explicit one-step revision protocol. */
export function savedOption(
  source: DecisionSource,
  option: DecisionOption,
  select = false
): DecisionSource {
  return {
    decision: {
      ...source.decision,
      revision: source.decision.revision + 1,
      ...(select ? { selectedOptionId: option.id } : {}),
    },
    options: [...source.options.filter((candidate) => candidate.id !== option.id), option].toSorted(
      (a, b) => a.id - b.id
    ),
  };
}
/** Apply confirmed removal without erasing any other option or selection. */
export function removedOption(source: DecisionSource, id: number): DecisionSource {
  return {
    decision: {
      ...source.decision,
      revision: source.decision.revision + 1,
      selectedOptionId:
        source.decision.selectedOptionId === id ? null : source.decision.selectedOptionId,
    },
    options: source.options.filter((option) => option.id !== id),
  };
}
