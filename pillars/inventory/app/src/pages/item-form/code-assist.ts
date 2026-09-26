/** The item currently holding a code another item tried to use. */
export interface CodeHolder {
  readonly id: string;
  readonly name: string;
}

/** A code value together with the server's current availability state. */
export interface CodeEntry {
  readonly value: string;
  readonly status:
    | 'idle'
    | 'suggesting'
    | 'offered'
    | 'checking'
    | 'free'
    | 'taken'
    | 'unavailable';
  readonly offered: string | null;
  readonly freeCode: string | null;
  readonly takenBy: CodeHolder | null;
}

/** The code-assist state transitions owned by the item form. */
export type CodeAction =
  | { readonly type: 'typed'; readonly value: string }
  | { readonly type: 'suggest' }
  | { readonly type: 'suggested'; readonly suggestion: string | null }
  | {
      readonly type: 'checked';
      readonly freeCode: string | null;
      readonly taken: boolean;
      readonly holder?: CodeHolder | null;
    }
  | { readonly type: 'offline' }
  | { readonly type: 'unavailable' }
  | { readonly type: 'accept-offered' };

function suggestedEntry(entry: CodeEntry, suggestion: string | null): CodeEntry {
  if (suggestion === null)
    return { ...entry, status: 'unavailable', offered: null, freeCode: null, takenBy: null };
  return { ...entry, status: 'offered', offered: suggestion };
}

function checkedEntry(
  entry: CodeEntry,
  action: Extract<CodeAction, { type: 'checked' }>
): CodeEntry {
  return {
    ...entry,
    status: action.taken ? 'taken' : 'free',
    freeCode: action.freeCode,
    takenBy: action.taken ? (action.holder ?? null) : null,
  };
}

function acceptedEntry(entry: CodeEntry): CodeEntry {
  if (entry.offered === null) return entry;
  return {
    value: entry.offered,
    status: 'free',
    offered: null,
    freeCode: entry.offered,
    takenBy: null,
  };
}

/** Creates an empty code entry. */
export function codeEntry(value = ''): CodeEntry {
  return {
    value,
    status: value === '' ? 'idle' : 'free',
    offered: null,
    freeCode: value || null,
    takenBy: null,
  };
}

/** Reduces code input, suggestions and availability responses. */
export function codeReducer(entry: CodeEntry, action: CodeAction): CodeEntry {
  switch (action.type) {
    case 'typed':
      return {
        value: action.value,
        status: action.value.trim() === '' ? 'idle' : 'checking',
        offered: null,
        freeCode: null,
        takenBy: null,
      };
    case 'suggest':
      return { ...entry, status: 'suggesting', offered: null };
    case 'suggested':
      return suggestedEntry(entry, action.suggestion);
    case 'checked':
      return checkedEntry(entry, action);
    case 'offline':
      return { ...entry, status: 'unavailable', offered: null, freeCode: null, takenBy: null };
    case 'unavailable':
      return { ...entry, status: 'unavailable', offered: null, freeCode: null, takenBy: null };
    case 'accept-offered':
      return acceptedEntry(entry);
  }
}

/** Returns the blocker copy for a code state, or null when code is valid. */
export function codeBlocksSave(entry: CodeEntry): string | null {
  if (entry.status === 'taken') return 'That code is already used.';
  if (entry.status === 'checking') return 'Checking code availability…';
  if (entry.status === 'suggesting') return 'Finding a code…';
  return null;
}
