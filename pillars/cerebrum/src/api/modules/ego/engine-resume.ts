import { CitationParser } from './citation-parser.js';
import { resumeToolLoop } from './loop-resume.js';

import type { ActionRunEvent } from './action-runner.js';
import type { EgoLlm } from './llm.js';
import type { ActionResolution } from './loop-resume.js';
import type { PausedLoopState } from './tool-loop-types.js';
import type { EgoToolbox } from './toolbox.js';
import type { ChatStreamEvent } from './types.js';

type ResumeWrite = NonNullable<Parameters<typeof resumeToolLoop>[0]['runWrite']>;

/** Inputs provided by the stream route to continue a paused turn. */
export interface ResumeStreamParams {
  state: PausedLoopState;
  runActions: AsyncGenerator<ActionRunEvent, ReadonlyMap<string, ActionResolution>>;
  allowedTools: readonly string[];
}

interface ResumeGeneratorParams extends Omit<ResumeStreamParams, 'allowedTools'> {
  llm: EgoLlm;
  toolbox?: EgoToolbox;
  allowedTools: ReadonlySet<string>;
  runWrite?: ResumeWrite;
  newActionId: () => string;
  newBatchId: () => string;
}

/** Run approved actions, then continue the saved tool loop as a stream. */
export async function* generateResumeEvents(
  params: ResumeGeneratorParams
): AsyncGenerator<ChatStreamEvent> {
  const actionIterator = params.runActions[Symbol.asyncIterator]();
  let resolutions: ReadonlyMap<string, ActionResolution>;
  while (true) {
    const next = await actionIterator.next();
    if (next.done) {
      resolutions = next.value;
      break;
    }
    yield next.value;
  }

  const citationParser = new CitationParser();
  for await (const event of resumeToolLoop({
    llm: params.llm,
    state: params.state,
    resolutions,
    newActionId: params.newActionId,
    newBatchId: params.newBatchId,
    allowedTools: params.allowedTools,
    ...(params.toolbox === undefined ? {} : { toolbox: params.toolbox }),
    ...(params.runWrite === undefined ? {} : { runWrite: params.runWrite }),
  })) {
    if (event.type !== 'done') {
      yield event;
      continue;
    }

    const parsed = citationParser.parse(event.fullText, []);
    const parts = parsed.cleanedAnswer
      ? [{ type: 'text' as const, text: parsed.cleanedAnswer }, ...event.parts]
      : event.parts;
    yield {
      type: 'done',
      content: parsed.cleanedAnswer,
      citations: parsed.citations.map((citation) => citation.id),
      tokensIn: event.tokensIn,
      tokensOut: event.tokensOut,
      parts,
      batch: event.batch,
      autoExecuted: event.autoExecuted,
    };
  }
}
