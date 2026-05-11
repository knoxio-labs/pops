/**
 * Pure helpers for summarising a reflex trigger/action into a short label.
 *
 * Extracted from the list/detail pages so they can be reused (and tested)
 * without dragging in React.
 */
import type { ReflexAction, ReflexTrigger } from './types';

export function summariseTrigger(trigger: ReflexTrigger): string {
  switch (trigger.type) {
    case 'event':
      return `event ${trigger.event ?? '?'}`;
    case 'threshold':
      return `threshold ${trigger.metric ?? '?'} ≥ ${trigger.value ?? '?'}`;
    case 'schedule':
      return `schedule ${trigger.cron ?? '?'}`;
  }
}

export function summariseAction(action: ReflexAction): string {
  return `${action.type}.${action.verb}`;
}
