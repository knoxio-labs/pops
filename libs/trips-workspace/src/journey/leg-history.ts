import type { JourneyChange, JourneyChangeResult, JourneyCommand } from './types';

/** Rebase inverse guards only across a confirmed own exact successor, never from a later source read. */
export function nextJourneyHistory(
  history: JourneyChange[],
  result: JourneyChangeResult,
  command: JourneyCommand,
  undo: boolean
): JourneyChange[] {
  if (result.clearHistory) return [];
  const retained = undo ? history.slice(0, -1) : history;
  const next = result.inverse && !undo ? [...retained, result.inverse] : retained;
  if (command.kind === 'journey') return next;
  if (result.source.legRevision !== command.expectedRevision + 1) return [];
  return next.map((change) =>
    change.kind === 'journey' ? change : { ...change, expectedRevision: result.source.legRevision }
  );
}
