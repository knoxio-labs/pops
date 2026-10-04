import { Bot } from 'lucide-react';

import { AssistantMarkdown } from './AssistantMarkdown';
import { MessageParts } from './MessageParts';
import { ToolActivityIndicator } from './ToolActivityIndicator';

import type { MessagePart } from '../chat-hooks/message-parts';
import type { ToolActivity } from '../chat-hooks/types';

interface StreamingBubbleProps {
  content: string;
  tools: ToolActivity[];
  parts: MessagePart[];
}

/** Renders streamed tools, prose and rich parts in the order received. */
export function StreamingBubble({ content, tools, parts }: StreamingBubbleProps) {
  return (
    <div className="flex gap-3" data-testid="streaming-bubble">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-accent/10 text-app-accent">
        <Bot className="h-4 w-4" />
      </div>
      <div className="max-w-[80%] space-y-2 rounded-lg bg-muted/50 px-4 py-3 text-foreground">
        <ToolActivityIndicator tools={tools} />
        {content.length > 0 && <AssistantMarkdown>{content}</AssistantMarkdown>}
        {parts.length > 0 && <MessageParts decisions={null} parts={parts} />}
      </div>
    </div>
  );
}
