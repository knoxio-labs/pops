/**
 * Structural subset of `child_process.spawn` that the Instagram
 * acquisition handlers (yt-dlp, whisper, ffmpeg) actually use.
 *
 * `typeof spawn` is a four-way overloaded signature that no `vi.fn()`
 * can satisfy without a cast. Handlers
 * only read `stdout`/`stderr` data, listen for `error`/`close`, and
 * `kill()` the child, so the seam is narrowed to exactly that — a real
 * `ChildProcess` still satisfies it, so production wiring is unchanged.
 */
import type { SpawnOptions } from 'node:child_process';

export interface SpawnedStream {
  on(event: 'data', listener: (chunk: Buffer | string) => void): this;
}

export interface SpawnedProcess {
  readonly stdout: SpawnedStream | null;
  readonly stderr: SpawnedStream | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
}

export type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: SpawnOptions
) => SpawnedProcess;
