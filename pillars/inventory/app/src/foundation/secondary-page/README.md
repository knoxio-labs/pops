# Secondary-page foundation

The Connections, Fixtures, fixture detail, and Reports surfaces share these
controlled list and state parts. The parts render UI only; the only network
reader in this directory's slice is `useConnectionsTabCounts`, which asks the
registry and fixture hooks for their unfiltered totals.

`PickList` keeps its filter input mounted when `body` is supplied. The body
replaces the listbox so a caller can show loading or failure content without
losing the user's query or focus. Refused options remain visible, expose
`aria-disabled`, and show their refusal instead of their metadata.

Fixture kinds are strict server-text matches. Unknown stored types keep their
original label and use the generic fixture mark. `ConnectionsTabs` is a
controlled visual tab only; the page owns navigation through `onChange`.

`roomOf` selects the first location whose semantic kind is `room`, so nested
areas and storage do not change the room label used by secondary pages.
