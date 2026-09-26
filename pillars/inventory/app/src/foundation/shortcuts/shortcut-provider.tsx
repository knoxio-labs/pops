/**
 * Provides one inventory shortcut dispatcher. Page scopes register handlers
 * temporarily while global handlers stay available as their fallback.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';

import { matchesCombo } from '@pops/ui';

import { createSequenceMatcher } from './shortcut-sequence';
import { TYPING_TARGET_BINDINGS, bindingsFor, isTypingTarget, shortcut } from './shortcuts';

import type { ReactElement, ReactNode, MutableRefObject } from 'react';

import type { ShortcutBinding, ShortcutScope } from './shortcut-bindings';

/**
 * Return false to pass the key on: a scope handler's false runs the global
 * handler for the same id; a global handler's false leaves the event unprevented.
 */
export type ShortcutHandler = (event: KeyboardEvent) => boolean | void;

/** Keyed by registry id. */
export type ShortcutHandlers = Partial<Record<string, ShortcutHandler>>;

type PageScope = Exclude<ShortcutScope, 'global' | 'palette'>;
type DispatchScope = Exclude<ShortcutScope, 'palette'>;
type HandlerRef = MutableRefObject<ShortcutHandlers>;

interface ScopeRegistration {
  id: symbol;
  scope: PageScope;
  handlers: HandlerRef;
}

interface ShortcutContextValue {
  registrations: MutableRefObject<ScopeRegistration[]>;
  registerScope: (scope: PageScope, handlers: HandlerRef) => () => void;
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null);
const TYPING_TARGET_IDS = new Set<string>(TYPING_TARGET_BINDINGS);

function lastRegistration(
  registrations: readonly ScopeRegistration[]
): ScopeRegistration | undefined {
  return registrations[registrations.length - 1];
}

function eventTarget(
  event: KeyboardEvent
): { tagName?: string; isContentEditable?: boolean } | null {
  return event.target instanceof HTMLElement ? event.target : null;
}

function liveBindings(scope: DispatchScope): ShortcutBinding[] {
  return bindingsFor(scope).filter((binding) => binding.id !== 'palette');
}

function invoke(
  id: string,
  registration: ScopeRegistration | undefined,
  globalHandlers: ShortcutHandlers,
  event: KeyboardEvent
): boolean {
  const scopedHandler = registration?.handlers.current[id];
  if (scopedHandler !== undefined && scopedHandler(event) !== false) return true;

  const globalHandler = globalHandlers[id];
  return globalHandler !== undefined && globalHandler(event) !== false;
}

interface ListenerContext {
  globalHandlers: MutableRefObject<ShortcutHandlers>;
  registrations: MutableRefObject<ScopeRegistration[]>;
}

function createDispatcher({
  globalHandlers,
  registrations,
}: ListenerContext): (event: KeyboardEvent) => void {
  let matcherScope: DispatchScope = 'global';
  let matcher = createSequenceMatcher(liveBindings(matcherScope));

  return (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;

    const registration = lastRegistration(registrations.current);
    const scope = registration?.scope ?? 'global';
    if (isTypingTarget(eventTarget(event))) {
      const binding = bindingsFor(scope).find(
        (entry) =>
          TYPING_TARGET_IDS.has(entry.id) &&
          entry.sequence.length === 1 &&
          matchesCombo(event, entry.sequence[0] ?? '')
      );
      if (
        binding !== undefined &&
        invoke(binding.id, registration, globalHandlers.current, event)
      ) {
        event.preventDefault();
      }
      return;
    }

    if (scope !== matcherScope) {
      matcherScope = scope;
      matcher = createSequenceMatcher(liveBindings(scope));
    }

    const binding = matcher.feed(event, event.timeStamp);
    if (binding !== null && invoke(binding.id, registration, globalHandlers.current, event)) {
      event.preventDefault();
    }
  };
}

function createPaletteDispatcher({
  globalHandlers,
  registrations,
}: ListenerContext): (event: KeyboardEvent) => void {
  const paletteCombo = shortcut('palette').sequence[0] ?? '';

  return (event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      isTypingTarget(eventTarget(event)) ||
      !matchesCombo(event, paletteCombo)
    ) {
      return;
    }

    const registration = lastRegistration(registrations.current);
    if (invoke('palette', registration, globalHandlers.current, event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
}

function installListeners(context: ListenerContext): () => void {
  const dispatch = createDispatcher(context);
  const dispatchPalette = createPaletteDispatcher(context);
  window.addEventListener('keydown', dispatch);
  window.addEventListener('keydown', dispatchPalette, true);
  return () => {
    window.removeEventListener('keydown', dispatch);
    window.removeEventListener('keydown', dispatchPalette, true);
  };
}

/** Installs the inventory dispatcher and capture-phase palette listener. */
export function ShortcutProvider({
  globalHandlers,
  children,
}: {
  globalHandlers: ShortcutHandlers;
  children: ReactNode;
}): ReactElement {
  const globalHandlersRef = useRef(globalHandlers);
  const registrations = useRef<ScopeRegistration[]>([]);

  useLayoutEffect(() => {
    globalHandlersRef.current = globalHandlers;
  }, [globalHandlers]);

  const registerScope = useCallback((scope: PageScope, handlers: HandlerRef): (() => void) => {
    const registration: ScopeRegistration = { id: Symbol(), scope, handlers };
    registrations.current.push(registration);
    return () => {
      registrations.current = registrations.current.filter((entry) => entry.id !== registration.id);
    };
  }, []);

  const context = useMemo<ShortcutContextValue>(
    () => ({ registrations, registerScope }),
    [registerScope]
  );

  useEffect(
    () => installListeners({ globalHandlers: globalHandlersRef, registrations }),
    [registrations]
  );

  return <ShortcutContext.Provider value={context}>{children}</ShortcutContext.Provider>;
}

/** Registers a page scope; the newest mounted scope receives matching keys. */
export function useShortcutScope(scope: PageScope, handlers: ShortcutHandlers): void {
  const context = useContext(ShortcutContext);
  if (context === null) throw new Error('useShortcutScope must be used inside ShortcutProvider');

  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);
  useEffect(() => context.registerScope(scope, handlersRef), [context, scope]);
}
