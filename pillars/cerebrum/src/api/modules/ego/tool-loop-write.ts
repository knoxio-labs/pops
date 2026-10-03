import type { LoopEvent, ProposedAction } from './tool-loop-types.js';

/** Run a conversation-authorized write and report its lifecycle to the stream. */
export async function* runAllowedWrite(
  runWrite: (
    tool: string,
    args: Record<string, unknown>
  ) => Promise<{ text: string; isError: boolean }>,
  name: string,
  action: ProposedAction,
  started: boolean
): AsyncGenerator<LoopEvent, { text: string; isError: boolean }> {
  if (!started) yield { type: 'tool', name, status: 'started' };
  let result: { text: string; isError: boolean };
  try {
    result = await runWrite(action.tool, action.args);
  } catch (error) {
    result = { text: error instanceof Error ? error.message : String(error), isError: true };
  }
  yield { type: 'tool', name, status: result.isError ? 'failed' : 'finished' };
  return result;
}
