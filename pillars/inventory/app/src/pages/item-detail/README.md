# Item detail actions

The item detail page keeps placement and lifecycle changes on the current route. Header verbs are
derived from the item state: `Pick up`, `Put back`, `Move`, `Store here`, container access, `Edit`,
and the grouped More menu. Successful reversible mutations use the shared inventory Undo toast;
refusals stay below the header as `Not saved` feedback.

Stored catalogue facts use the field's stable catalogue key for lookup and edit in place. The
editor validates the published field definition before sending a protocol-2 value patch. An edit
is `saving` when it starts immediately, `pending` when another mutation for the item is already in
flight, and `rejected` when the server refuses it. Computed facts are display-only.

The detail route uses one page-shaped skeleton while the item is loading. Once the item exists,
incomplete independent reads keep the page usable behind a partial banner; unavailable reads use
the offline banner and retry action. A lead-read error stays a retryable error state, while a
missing item explains that its code may belong to something else now.

The detail shortcut scope combines tab navigation with `e` (edit), `p` (placement), `m` (move),
`o` (open or close), `c` (copy code), `h` (history), `[` (previous), and `]` (next). Item and
container lists carry the loaded row ids in router state, so the back row and neighbouring detail
navigation remain tied to the list view that opened the item.
