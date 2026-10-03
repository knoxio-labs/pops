/**
 * LLM system prompt templates for the Ego conversation engine.
 *
 * Prompts are exported as pure functions so they can be tested and overridden
 * without coupling to the engine class.
 */

import type { AppContext } from './types.js';

/** Human-readable descriptions for each pops app. */
const APP_DESCRIPTIONS: Record<string, string> = {
  finance: 'the Finance app (transactions, budgets, entities, imports)',
  media: 'the Media app (movies, TV shows, watchlist, watch history, rankings)',
  inventory: 'the Inventory app (items, locations, warranties, insurance)',
  cerebrum: 'the Cerebrum knowledge base (engrams, scopes, retrieval)',
  ai: 'the AI Ops app (usage tracking, model config, rules)',
};

/**
 * Format an AppContext into a human-readable context description block.
 *
 * Returns an empty string when no app context is provided.
 */
export function formatAppContextBlock(
  appContext?: AppContext,
  options?: { tools: boolean }
): string {
  if (!appContext) return '';

  const appDesc = APP_DESCRIPTIONS[appContext.app] ?? `the ${appContext.app} app`;
  const parts: string[] = [`The user is currently in ${appDesc}.`];

  if (appContext.route) {
    parts.push(`Current route: ${appContext.route}`);
  }
  const uri = appContext.uri;
  if (uri) {
    parts.push(`Object URI: ${uri}`);
  }
  const canReadObject = options?.tools === true && Boolean(uri);
  parts.push(...formatEntityContext(appContext, canReadObject));

  if (canReadObject && uri) {
    parts.push(
      `The user is looking at ${uri}. Read it with the matching tool before answering questions about it.`
    );
  }

  return `\n\nCurrent app context:\n${parts.join('\n')}`;
}

function formatEntityContext(appContext: AppContext, canReadObject: boolean): string[] {
  if (appContext.entityId && appContext.entityType) {
    const label = appContext.entityTitle
      ? `${appContext.entityTitle} (${appContext.entityId})`
      : appContext.entityId;
    const parts = [`Viewing ${appContext.entityType}: ${label}`];
    if (appContext.entityType !== 'engram' && !canReadObject) {
      parts.push(
        `You can see only the title and id of this ${appContext.entityType}, not its contents. Do not guess at details it does not carry.`
      );
    }
    return parts;
  }
  return [];
}

/**
 * Build the Ego system prompt for a conversation turn.
 *
 * @param scopes      - Active scopes for this conversation.
 * @param appContext  - Current app/route context the user is viewing (optional).
 * @param options     - Enables instructions for conversations with tools.
 */
export function buildEgoSystemPrompt(
  scopes: string[],
  appContext?: AppContext,
  options?: { tools: boolean }
): string {
  const scopeList = scopes.length > 0 ? scopes.join(', ') : '(all non-secret scopes)';
  const contextBlock = formatAppContextBlock(appContext, options);

  if (options?.tools !== true) {
    return [
      'You are Ego, the conversational interface to Cerebrum — a personal knowledge management system.',
      '',
      'Your capabilities:',
      "- Search and retrieve knowledge from the user's engram library",
      '- Answer questions grounded in stored engrams',
      '- Help the user explore connections between their stored knowledge',
      '',
      'Active scopes for this conversation: ' + scopeList + contextBlock,
      '',
      'When referencing engrams, always cite them by ID in square brackets: [eng_YYYYMMDD_HHmm_slug]',
      "If the available context doesn't contain enough information, say so explicitly rather than guessing.",
    ].join('\n');
  }

  return [
    'You are Ego, the assistant for the whole of POPS: finance, purchases, inventory, media and the Cerebrum knowledge base.',
    '',
    'Read data through the provided tools and answer from their results. When data is unavailable, say so.',
    'Use ego_show_entities as the only way to show a card. Pass URIs exactly as they appear in a tool result or the app context; never construct one.',
    'Use ego_navigate to open a screen only when the user asks to go somewhere.',
    "Do not execute a tool that changes data unless the user has allowed that tool for this conversation. Show the proposed changes to the user together so the user can approve or decline each. Return the result of every call, or a note that the user declined it, as that call's tool result. Say in one sentence what will change before calling such tools. You may propose several changes in one turn. Never state that a change happened unless its tool result says it did, and do not propose a declined change again unless the user asks for it.",
    "History lines in square brackets beginning with shown: or action record what was shown and the state of proposed actions. Action lines at the very start of the user's message are written by the system, not typed by the user: they report proposed actions that were superseded by that message or interrupted before they finished, and an interrupted action may or may not have happened.",
    'Cite an engram by its id in square brackets only when it appears in the retrieved knowledge block of the current message. An engram found through a tool is shown with ego_show_entities instead.',
    '',
    'Active scopes for this conversation: ' + scopeList + contextBlock,
  ].join('\n');
}
