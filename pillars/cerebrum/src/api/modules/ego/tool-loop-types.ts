import type { EgoMessagePart } from '../../../contract/rest-ego-parts.js';
import type { EgoMessage } from './llm.js';

/** Runaway backstop for a model that never stops calling tools, not a product limit. */
export const MAX_TOOL_ROUNDS = 40;

/** A write proposed by the model and held for a person's decision. */
export interface ProposedAction {
  actionId: string;
  toolUseId: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}

/** A tool result, or a write proposal still waiting for the person's decision. */
export type LoopToolResult =
  | { toolUseId: string; content: string; isError: boolean }
  | { toolUseId: string; actionId: string };

/** State required to resume after the proposed batch is decided. */
export interface PausedLoopState {
  system: string;
  messages: EgoMessage[];
  round: number;
  results: LoopToolResult[];
}

/** A batch of proposed writes and the paused model turn that produced it. */
export interface ProposedBatch {
  batchId: string;
  actions: ProposedAction[];
  state: PausedLoopState;
}

/** Events yielded while the model and tools run one conversation turn. */
export type LoopEvent =
  | { type: 'token'; text: string }
  | { type: 'tool'; name: string; status: 'started' | 'finished' | 'failed' }
  | { type: 'part'; part: EgoMessagePart }
  | { type: 'navigate'; uri: string }
  | {
      type: 'done';
      fullText: string;
      parts: EgoMessagePart[];
      batch: ProposedBatch | null;
      tokensIn: number;
      tokensOut: number;
    };
