/**
 * Comment mode, rendered inside the frame over the surface itself.
 *
 * Inside rather than over: anchoring is a hit test against the surface's own
 * document, and an overlay in the chrome would have to undo the frame's scale
 * and offset to run one. See the note on the message types in
 * `src/shell/viewport.ts`.
 *
 * The whole overlay is absent when the API is unreachable, which is the
 * normal state of a local checkout with no service token.
 */
import { useCallback, useEffect, useState } from 'react';

import { findTarget } from './anchors';
import { createThread, replyToThread, setThreadStatus, type Thread } from './api';
import { Composer } from './Composer';
import { Panel } from './Panel';
import { Pin } from './Pin';
import { placePins } from './pin-positions';
import { useThreads } from './useThreads';

import type { Anchor } from './anchors-types';

interface Pending {
  anchor: Anchor;
  at: { x: number; y: number };
}

/** Re-place the pins on anything that can move an element under one. */
function useReflow(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = (): void => setTick((value) => value + 1);
    window.addEventListener('scroll', bump, true);
    window.addEventListener('resize', bump);
    return () => {
      window.removeEventListener('scroll', bump, true);
      window.removeEventListener('resize', bump);
    };
  }, []);
  return tick;
}

/**
 * While comment mode is on, a click anywhere on the surface opens a composer
 * instead of doing what the surface would have done with it. Captured on the
 * way down, so a button's own handler never runs.
 */
function usePinning(enabled: boolean, setPending: (pending: Pending) => void): void {
  const onClick = useCallback(
    (event: MouseEvent) => {
      const target = findTarget(document, event.clientX, event.clientY);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      setPending({ anchor: target.anchor, at: { x: event.clientX, y: event.clientY } });
    },
    [setPending]
  );

  useEffect(() => {
    if (!enabled) return undefined;
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [enabled, onClick]);
}

/** Every thread's pin, re-placed whenever the surface may have moved. */
function Pins({
  threads,
  reflow,
  selected,
  onSelect,
}: {
  threads: Thread[];
  /** Bumped on scroll and resize; the pins are positioned, not laid out. */
  reflow: number;
  selected: string | null;
  onSelect: (threadId: string) => void;
}) {
  return (
    <>
      {placePins(document, threads).map(({ thread, index, left, top }) => (
        <Pin
          key={`${thread.id}-${reflow}`}
          thread={thread}
          index={index}
          rect={{ left, top }}
          selected={selected === thread.id}
          onSelect={() => onSelect(thread.id)}
        />
      ))}
    </>
  );
}

interface CommentsOverlayProps {
  active: boolean;
  route: string;
  themeKey: string;
  onOpenCountChange: (open: number) => void;
  onExit: () => void;
}

/** Report the open-thread count up to the shell, for the dock's badge. */
function useOpenCountReport(
  threads: Thread[],
  available: boolean | null,
  onOpenCountChange: (open: number) => void
): void {
  const openCount = threads.filter((thread) => thread.status === 'open').length;
  useEffect(() => {
    onOpenCountChange(available === true ? openCount : 0);
  }, [available, onOpenCountChange, openCount]);
}

export function CommentsOverlay({
  active,
  route,
  themeKey,
  onOpenCountChange,
  onExit,
}: CommentsOverlayProps) {
  const { threads, available, refresh } = useThreads(route);
  const [pending, setPending] = useState<Pending | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const reflow = useReflow();
  const enabled = active && available === true;

  useOpenCountReport(threads, available, onOpenCountChange);
  usePinning(enabled, setPending);

  useEffect(() => {
    if (!active) setPending(null);
  }, [active]);
  if (!enabled) return null;

  const write = async (action: Promise<unknown>): Promise<void> => {
    await action;
    refresh();
  };

  const submit = (body: string): void => {
    if (!pending) return;
    const anchor = pending.anchor;
    setPending(null);
    void write(
      createThread({
        route,
        themeKey,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        anchor,
        body,
      })
    );
  };

  return (
    <>
      <Pins
        threads={threads}
        reflow={reflow}
        selected={selected}
        onSelect={(id) => setSelected(selected === id ? null : id)}
      />
      {pending ? (
        <Composer {...pending} onSubmit={submit} onCancel={() => setPending(null)} />
      ) : null}
      <Panel
        threads={threads}
        onReply={(threadId, bodyText) => void write(replyToThread(threadId, bodyText))}
        onStatus={(threadId, next) => void write(setThreadStatus(threadId, next))}
        onClose={onExit}
      />
    </>
  );
}
