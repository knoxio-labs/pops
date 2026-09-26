# Fixtures

A fixture is house infrastructure an item plugs into but the user does not own —
power outlets, ethernet ports, HDMI wall plates, light switches. They live in
their own table, not in `items`. Deleting a fixture cascades away its
`item_fixture_connections` rows (`onDelete: 'cascade'` on `fixtureId`, with
`foreign_keys = ON` set in `src/db/open-inventory-db.ts`) and touches nothing
else: `item_connections` references `items` only. Deletion is one row
at a time — there is no bulk endpoint in the contract.

`type` is free text, not an enum, so a new kind of fixture never needs a
migration. `name` is not unique — "Power Outlet" exists in every room.

## Who calls this

Nothing in `app/`. The inventory frontend has no fixtures screen at all; the
generated client simply carries the bindings. The only consumer of the
`fixtures.*` contract is the `mcp` pillar, which wraps these endpoints as tools
so fixtures can be created and wired up by conversation.

## Deliberately absent

- Fixtures are leaf nodes in the item connection graph and trace. Traversal
  includes each fixture wired to a visited item, but never walks through a
  fixture to another item, so two things plugged into one outlet are not
  connected to each other.
- There is no confirmation handshake on delete, unlike locations. Deleting a
  fixture always succeeds; the connection cascade is the whole safety story.
- The list endpoint filters by `locationId` and `type` only — no free-text
  search.
- Fixture-to-fixture connections do not exist.

## Error mapping

`connectItemToFixture` distinguishes the two failure modes SQLite reports
identically at first glance: a unique-constraint violation becomes a 409, and a
foreign-key violation triggers a follow-up lookup of the item so the 404 can name
which side is missing rather than saying "not found".
