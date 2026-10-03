import { EntityCard } from '../entity-cards/EntityCard';
import { ActionsCard } from './ActionsCard';
import { AssistantMarkdown } from './AssistantMarkdown';

import type { ReactNode } from 'react';

import type { EntityPart, MessagePart } from '../chat-hooks/message-parts';
import type { BatchDecisionApi } from '../chat-hooks/useBatchDecision';

interface MessagePartsProps {
  parts: MessagePart[];
  decisions: BatchDecisionApi | null;
}

/** Renders validated assistant message parts in their original order. */
export function MessageParts({ parts, decisions }: MessagePartsProps) {
  const rendered: ReactNode[] = [];
  let entityRun: Array<{ index: number; part: EntityPart }> = [];

  const flushEntityRun = () => {
    if (entityRun.length === 0) return;
    const firstEntity = entityRun[0];
    if (!firstEntity) return;
    const firstIndex = firstEntity.index;
    rendered.push(
      <div
        key={`entity-run-${firstIndex}`}
        aria-label="Related entities"
        className="flex flex-col gap-2"
        role="group"
      >
        {entityRun.map(({ index, part }) => (
          <EntityCard key={index} part={part} />
        ))}
      </div>
    );
    entityRun = [];
  };

  parts.forEach((part, index) => {
    if (part.type === 'entity') {
      entityRun.push({ index, part });
      return;
    }

    flushEntityRun();
    switch (part.type) {
      case 'text':
        rendered.push(<AssistantMarkdown key={index}>{part.text}</AssistantMarkdown>);
        break;
      case 'actions':
        rendered.push(<ActionsCard key={index} decisions={decisions} part={part} />);
        break;
      default:
        rendered.push(
          <div key={index} className="text-sm text-muted-foreground" role="note">
            Unsupported message part
          </div>
        );
    }
  });

  flushEntityRun();
  return <>{rendered}</>;
}
