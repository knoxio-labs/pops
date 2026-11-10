/** Closers owned by the script-observing browser fixture, including partial setup. */
export interface ScriptBrowserClosers {
  readonly connected?: () => Promise<void>;
  readonly wire?: () => void;
  readonly launcher: () => Promise<void>;
}

/** Always close the launcher, preserving every connected-browser or wire cleanup failure. */
export async function closeScriptBrowserResources(closers: ScriptBrowserClosers): Promise<void> {
  const errors: unknown[] = [];
  try {
    await closers.connected?.();
  } catch (error) {
    errors.push(error);
  }
  try {
    closers.wire?.();
  } catch (error) {
    errors.push(error);
  }
  try {
    await closers.launcher();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Script browser cleanup failed');
}
