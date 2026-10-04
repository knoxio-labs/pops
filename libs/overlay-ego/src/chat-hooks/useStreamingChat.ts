/**
 * Low-level SSE streaming hook for ego chat (PRD-087 US-01 AC #6).
 *
 * Fetches from the /cerebrum-api/ego/chat/stream SSE endpoint and processes
 * the event stream, updating state as tokens arrive.
 */
import { useCallback, useReducer, useRef, useState } from 'react';

import { parseStreamFrame } from './stream-frames';
import { INITIAL_STREAM_STATE, reduceStreamFrame, STREAM_START_STATE } from './stream-reducer';
import { useEgoAppContext } from './useEgoAppContext';

import type { MessagePart } from './message-parts';
import type { StreamFrame } from './stream-frames';
import type { StreamState, ToolActivity } from './stream-reducer';
import type { RetrievedEngram } from './types';

/** Shell proxy path to cerebrum's POST /ego/chat/stream endpoint. */
export const EGO_STREAM_URL = '/cerebrum-api/ego/chat/stream';

export type StreamChatParams =
  | {
      /** Start a new turn or add a message to an existing conversation. */
      conversationId: string | null;
      message: string;
    }
  | {
      /** Conversation containing the decided action batch to resume. */
      conversationId: string;
      /** Decided action batch to continue through the stream. */
      resumeBatchId: string;
    };

interface StreamCallbacks {
  onConversation: (id: string) => void;
  onEngrams: (engrams: RetrievedEngram[]) => void;
  onInvalidate: (conversationId: string) => void | Promise<void>;
  onNavigate?: (uri: string) => void;
}

type StreamAction = { type: 'start' } | { type: 'reset' } | { type: 'frame'; frame: StreamFrame };

function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case 'start':
      return STREAM_START_STATE;
    case 'reset':
      return INITIAL_STREAM_STATE;
    case 'frame':
      return reduceStreamFrame(state, action.frame);
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

/** Process the SSE response body, dispatching frames to the stream reducer. */
async function processStream(
  body: ReadableStream<Uint8Array>,
  dispatch: React.Dispatch<StreamAction>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  callbacks: StreamCallbacks
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const frame = parseStreamFrame(trimmed);
      if (!frame) continue;

      dispatch({ type: 'frame', frame });
      if (frame.type === 'navigate') {
        callbacks.onNavigate?.(frame.uri);
      } else if (frame.type === 'done') {
        callbacks.onConversation(frame.conversationId);
        callbacks.onEngrams(frame.retrievedEngrams);
        await callbacks.onInvalidate(frame.conversationId);
        dispatch({ type: 'reset' });
      } else if (frame.type === 'error') {
        setError(frame.message);
      }
    }
  }
}

export interface UseStreamingChatReturn {
  /**
   * Start a new message turn or resume a paused turn through the SSE endpoint.
   *
   * A failed resume is not retried by this hook: writes that ran are never run
   * again, and writes the run did not reach stay `confirmed` for the chat model to
   * offer to continue (WEB-26); otherwise the person sends a new message. A resume
   * stream begins with `tool` and `part` frames for the approved writes before any
   * token.
   */
  stream: (params: StreamChatParams, callbacks: StreamCallbacks) => void;
  /** Whether a stream is currently active. */
  isStreaming: boolean;
  /** Error from the last stream attempt. */
  error: string | null;
  /** Partial streaming content (null when not streaming). */
  streamingContent: string | null;
  /** Tool calls and their latest lifecycle status from the active stream. */
  toolActivity: ToolActivity[];
  /** Message parts received from the active stream. */
  streamParts: MessagePart[];
  /** Clear the error state. */
  clearError: () => void;
}

export function useStreamingChat(): UseStreamingChatReturn {
  const [streamState, dispatchStream] = useReducer(streamReducer, INITIAL_STREAM_STATE);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const appContext = useEgoAppContext();

  const stream = useCallback(
    (params: StreamChatParams, callbacks: StreamCallbacks) => {
      if (isStreaming) return;

      setIsStreaming(true);
      setError(null);
      dispatchStream({ type: 'start' });

      const controller = new AbortController();
      abortRef.current = controller;

      const body =
        'message' in params
          ? {
              conversationId: params.conversationId ?? undefined,
              message: params.message,
              appContext,
            }
          : { conversationId: params.conversationId, resumeBatchId: params.resumeBatchId };

      fetch(EGO_STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('Stream request failed: ' + response.status);
          if (!response.body) throw new Error('Response body is null');
          await processStream(response.body, dispatchStream, setError, callbacks);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          setError(err instanceof Error ? err.message : 'Stream failed');
          dispatchStream({ type: 'reset' });
        })
        .finally(() => {
          setIsStreaming(false);
          abortRef.current = null;
        });
    },
    [isStreaming, appContext]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    stream,
    isStreaming,
    error,
    streamingContent: streamState.content,
    toolActivity: streamState.tools,
    streamParts: streamState.parts,
    clearError,
  };
}
