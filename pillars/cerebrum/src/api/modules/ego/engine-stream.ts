/**
 * Streaming generator for the ego conversation engine.
 *
 * Emits the scope notice (if any), then forwards the tool loop events and ends
 * with the citation-parsed answer plus its tool results.
 */
import { CitationParser } from './citation-parser.js';
import { runToolLoop } from './tool-loop.js';

import type { RetrievalResult } from '../retrieval/types.js';
import type { EgoChatMessage, EgoLlm } from './llm.js';
import type { EgoToolbox } from './toolbox.js';
import type { ChatStreamEvent } from './types.js';

interface StreamGeneratorParams {
  llm: EgoLlm;
  systemPrompt: string;
  llmMessages: EgoChatMessage[];
  scopeNotice: string | null;
  allResults: RetrievalResult[];
  toolbox?: EgoToolbox;
  newActionId: () => string;
  newBatchId: () => string;
  allowedTools: ReadonlySet<string>;
  runWrite?: NonNullable<Parameters<typeof runToolLoop>[0]['runWrite']>;
}

/**
 * Create an async generator that runs the Ego tool loop and emits its events.
 */
export async function* generateStreamEvents(
  params: StreamGeneratorParams
): AsyncGenerator<ChatStreamEvent> {
  const { llm, systemPrompt, llmMessages, scopeNotice, allResults } = params;
  const citationParser = new CitationParser();

  if (scopeNotice) {
    yield { type: 'token', text: scopeNotice + '\n\n' };
  }

  for await (const event of runToolLoop({
    llm,
    system: systemPrompt,
    messages: llmMessages,
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

    const { cleanedAnswer, citations } = citationParser.parse(event.fullText, allResults);
    const responseContent = scopeNotice ? scopeNotice + '\n\n' + cleanedAnswer : cleanedAnswer;
    const parts = responseContent
      ? [{ type: 'text' as const, text: responseContent }, ...event.parts]
      : event.parts;

    yield {
      type: 'done',
      content: responseContent,
      citations: citations.map((citation) => citation.id),
      tokensIn: event.tokensIn,
      tokensOut: event.tokensOut,
      parts,
      batch: event.batch,
      autoExecuted: event.autoExecuted,
    };
  }
}
