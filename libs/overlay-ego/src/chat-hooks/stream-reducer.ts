import type { MessagePart } from './message-parts';
import type { StreamFrame, ToolStatus } from './stream-frames';
import type { ToolActivity } from './types';
export type { ToolActivity } from './types';

/** Accumulated content and activity for the current stream. */
export interface StreamState {
  content: string | null;
  tools: ToolActivity[];
  parts: MessagePart[];
  persistedMessageId: string | null;
}

/** Empty state before a stream is active. */
export const INITIAL_STREAM_STATE: StreamState = {
  content: null,
  tools: [],
  parts: [],
  persistedMessageId: null,
};

/** Empty state immediately after a stream starts. */
export const STREAM_START_STATE: StreamState = {
  content: '',
  tools: [],
  parts: [],
  persistedMessageId: null,
};

/** Applies one frame without mutating the supplied state or its arrays. */
export function reduceStreamFrame(state: StreamState, frame: StreamFrame): StreamState {
  switch (frame.type) {
    case 'token':
      return { ...state, content: `${state.content ?? ''}${frame.text}` };
    case 'tool':
      return reduceToolActivity(state, frame.name, frame.status);
    case 'part':
      return { ...state, parts: [...state.parts, frame.part] };
    case 'error':
      return INITIAL_STREAM_STATE;
    case 'done':
      return { ...state, persistedMessageId: frame.messageId };
    case 'navigate':
      return state;
    default: {
      const unreachable: never = frame;
      return unreachable;
    }
  }
}

function reduceToolActivity(state: StreamState, name: string, status: ToolStatus): StreamState {
  if (status === 'started') {
    return { ...state, tools: [...state.tools, { name, status }] };
  }

  const activeIndex = findLatestStartedTool(state.tools, name);
  if (activeIndex === -1) {
    return { ...state, tools: [...state.tools, { name, status }] };
  }

  const tools = state.tools.map((tool, index) =>
    index === activeIndex ? { ...tool, status } : tool
  );
  return { ...state, tools };
}

function findLatestStartedTool(tools: ToolActivity[], name: string): number {
  for (let index = tools.length - 1; index >= 0; index -= 1) {
    const tool = tools[index];
    if (tool?.name === name && tool.status === 'started') return index;
  }
  return -1;
}
