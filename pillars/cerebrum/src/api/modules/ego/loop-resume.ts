import { runToolLoop } from './tool-loop.js';

import type { EgoActionStatus } from '../../../db/services/ego-actions-types.js';
import type { EgoMessage, EgoLlm } from './llm.js';
import type { LoopEvent, PausedLoopState } from './tool-loop-types.js';
import type { EgoToolbox } from './toolbox.js';

type WriteRunner = NonNullable<Parameters<typeof runToolLoop>[0]['runWrite']>;

/** The content and error state returned to the model for one resolved action. */
export interface ActionResolution {
  content: string;
  isError: boolean;
}

/** Result text sent to the model when a person declined a proposed action. */
export const DECLINED_RESULT = 'The user declined this action.';

/** Result text sent to the model when an action's execution outcome is unknown. */
export const INTERRUPTED_RESULT =
  'This action was interrupted before it finished, so its outcome is unknown. Do not assume it ran.';

/** Map an action's persisted lifecycle state to the result for its tool call. */
export function resolutionFor(action: {
  status: EgoActionStatus;
  result: string | null;
}): ActionResolution {
  switch (action.status) {
    case 'executed':
      return { content: action.result ?? '', isError: false };
    case 'failed':
      return { content: action.result ?? 'The action failed.', isError: true };
    case 'rejected':
      return { content: DECLINED_RESULT, isError: false };
    case 'pending':
    case 'confirmed':
      return { content: INTERRUPTED_RESULT, isError: true };
  }
}

/** Resume a paused model turn by supplying read and resolved-action tool results. */
export async function* resumeToolLoop(params: {
  llm: EgoLlm;
  toolbox?: EgoToolbox;
  state: PausedLoopState;
  resolutions: ReadonlyMap<string, ActionResolution>;
  newActionId: () => string;
  newBatchId: () => string;
  allowedTools?: ReadonlySet<string>;
  runWrite?: WriteRunner;
}): AsyncGenerator<LoopEvent> {
  const resultMessage: EgoMessage = {
    role: 'user',
    content: params.state.results.map((result) => {
      const resolution =
        'content' in result
          ? { content: result.content, isError: result.isError }
          : (params.resolutions.get(result.actionId) ?? {
              content: INTERRUPTED_RESULT,
              isError: true,
            });
      return {
        type: 'tool_result',
        tool_use_id: result.toolUseId,
        content: resolution.content,
        is_error: resolution.isError,
      };
    }),
  };

  yield* runToolLoop({
    llm: params.llm,
    toolbox: params.toolbox,
    system: params.state.system,
    messages: [...params.state.messages, resultMessage],
    startRound: params.state.round,
    newActionId: params.newActionId,
    newBatchId: params.newBatchId,
    allowedTools: params.allowedTools,
    runWrite: params.runWrite,
  });
}
