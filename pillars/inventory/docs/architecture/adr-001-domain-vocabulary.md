# Inventory ADR-001: One word per thing

## Status

Accepted — 2026-09-16.

## Context

The Inventory design programme (POPS-3978) is a stack of design tickets that
all draw the same nouns. The first two to be built drifted on them immediately:
POPS-3983 staged five variants of one screen and used _category_, _type_ and
_template_ for the same thing across them, and _capability_ and _property_
interchangeably for two things that are not the same. The reviewer's first
question on the finished screens was which of those words meant what.

That is not a copy problem. Every remaining ticket declares components, states
and actions in these words, on two clients, and a word that means one thing on
the phone and another on the web is a bug nobody can see in a diff. The
umbrella's own requirement is that iOS and web "preserve the same domain
language and action semantics" while composing differently.

Two decisions taken during POPS-3983 fix part of the vocabulary and are
recorded here rather than left in a ticket comment:

- An item's structured data is the fields its **type** declares; anything the
  type does not ask for is prose. (POPS-3983, decided on the device.)
- Types are defined in code and shipped by deploy, not authored in the product.
  An authoring interface would have to store types as generic
  `fields(name, kind, unit, choices)` rows — runtime-typed rows describing
  runtime-typed rows, which is the shape POPS-3983 rejected one level up.

## Options Considered

Two axes were genuinely contested. The rest of the glossary follows from them.

### What to call the shape an item has

| Option            | Pros                                                                                                                                                           | Cons                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type** (chosen) | The word the reviewer reaches for unprompted ("an item type for every type we encounter"); short; reads on a control label; matches that it is a code artefact | Collides with "type" as in value kind (text, measurement) — needs the second word below to stay clear                                                                |
| Category          | Familiar from shopping and filing; suggests a hierarchy                                                                                                        | Suggests a hierarchy we do not have, and suggests an item could sit in several; invites "uncategorised" as a state rather than "no type", which is a different thing |
| Template          | Describes what it does — it supplies fields                                                                                                                    | Implies a starting point you then diverge from, which is exactly what the decided design does not allow; it was POPS-3983's word for a variant that lost             |
| Kind              | Avoids the value-kind collision                                                                                                                                | Vague in a domain where everything is a kind of something; poor as a control label                                                                                   |

### Whether containment is a field or something else

| Option                                         | Pros                                                                                                                                      | Cons                                                                                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Capability, distinct from a field** (chosen) | "Can hold other items" changes what screens exist for an item, not what its detail displays; keeps the field vocabulary purely about data | A second concept to learn, and the line has to be held — the temptation to add "capabilities" that are really fields will be constant                                    |
| Containment as a boolean field                 | One concept instead of two; a type declares everything in one list                                                                        | A boolean that silently adds a whole screen is not a field, it is a behaviour wearing a field's clothes; nothing else about a field changes navigation                   |
| Container as a separate entity, not an item    | Simplest to reason about in isolation                                                                                                     | A box is a thing you own, locate, photograph, discard and pack into a bigger box; splitting it duplicates every one of those and makes "box inside a box" a special case |

## Decision

One word per thing, as follows. These are the words used in both playgrounds,
both clients, the contract, and this pillar's code.

### The thing itself

| Word                    | Means                                                                                                     | Not                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Item**                | Anything tracked. The only noun for a tracked thing.                                                      | "object", "asset", "thing", "entry"      |
| **Type**                | The code-defined shape an item has: its fields and its capabilities.                                      | "category", "template", "kind", "class"  |
| **Field**               | One slot a type declares — name, value kind, unit, allowed values, required or not.                       | "property", "attribute", "key"           |
| **Value**               | What one item records for one field.                                                                      | "property value", "data"                 |
| **Value kind**          | What sort of value a field takes: text, choice, yes/no, measurement, range, link.                         | "type" (reserved, above), "data type"    |
| **Note**                | Free prose on an item. Where anything the type does not ask for goes.                                     | "description", "comment", "custom field" |
| **Capability**          | A behaviour a type grants, which changes what an item can do and what screens it has. Today: containment. | a field; a tag; a permission             |
| **Inventory code**      | The identifier POPS assigns and prints on a label.                                                        | "ID", "barcode", "SKU"                   |
| **External identifier** | An identifier someone else assigned: a barcode, a serial, a model number.                                 | "code" unqualified                       |
| **Quantity**            | How many identical items one record stands for.                                                           | "count", "amount", "stock"               |

An item with the containment capability is a **container** — a word for a role,
not for a second entity. A container is an item: it has a type, a placement, a
lifecycle, a photo and a label like any other, and it can be inside another
container.

A **location** is a place in the home, not an item. It is the one thing here
that is not an item, because a room is not owned, moved, photographed or
discarded, and giving it a type would mean inventing fields for it.

### Where a thing is

| Word                   | Means                                                                            |
| ---------------------- | -------------------------------------------------------------------------------- |
| **Placement**          | Where an item is, as one concept, however it is expressed.                       |
| **Direct location**    | A location an item sits in with no container between.                            |
| **Containing item**    | The container an item is inside.                                                 |
| **Effective location** | The location derived by following containing items up to one. What search shows. |
| **Previous placement** | Where it was before the current placement. One step, not a history.              |

An item is placed **directly**, **inside a container**, or **in hand** — the
last meaning it has been picked up and not yet put anywhere. The word for that
state is an open question (see below); the state itself is not.

### What state it is in

Two independent axes, never conflated, and never shown as one badge:

| Axis          | Values                                      | Means                                     |
| ------------- | ------------------------------------------- | ----------------------------------------- |
| **Access**    | open, closed                                | Whether a container can be added to.      |
| **Lifecycle** | active, retired, discarded, lost, destroyed | Whether the item still exists and counts. |

A closed container is not a retired one, and a discarded item is not a closed
one. The two axes were written as one enum in an early fixture and immediately
produced states that cannot exist.

### Whether the device agrees with the server

**Saved**, **queued**, **synchronizing**, **synchronized**, **stale**, **needs
attention** — in that order of escalation. "Saved" means written locally and
nothing more; it is the state the phone is in most of the time and the one that
must not look like a problem.

### What a person does

| Action       | Means                                                |
| ------------ | ---------------------------------------------------- |
| **Add**      | Record an item POPS has never seen.                  |
| **Put in**   | Place an existing item into a container or location. |
| **Pick up**  | Take an item out of its placement into the hand.     |
| **Put back** | Return an in-hand item to its previous placement.    |
| **Move**     | Change a placement in one step, without picking up.  |
| **Close**    | Stop a container accepting items.                    |
| **Reopen**   | Undo a close.                                        |
| **Discard**  | End an item's life, reversibly.                      |
| **Restore**  | Undo a discard.                                      |

"Add" is for new items only. Putting a known item somewhere is never called
adding, because the two are different screens and conflating them is how an
item gets recorded twice.

## What is deliberately still open

These are experiments in the playground, not gaps in this ADR. Each is a
product question with more than one defensible answer, and each is answered by
looking rather than by argument:

- What to call the in-hand state — "in hand", "unplaced", or "picked up".
- Whether "close" and "seal" are two visible actions or one.
- Whether a container needs a distinct silhouette while remaining an item.
- Whether state is carried by a badge, a subtitle, an icon, or a combination.
- How much synchronization state is visible during ordinary use.

Deciding one of them updates this ADR rather than adding a second word.

## Consequences

- Every later design ticket declares components in these words and can be
  reviewed against this file rather than against the last screen somebody drew.
- A type is a code artefact, so adding one is a deploy. Filing an item whose
  type does not exist yet becomes a first-class path rather than an edge case
  (POPS-4016), and that path is load-bearing during a move.
- "Capability" is a concept that will be under constant pressure to absorb
  things that are really fields. The test is whether it changes what screens an
  item has; if it only changes what its detail displays, it is a field.
- Locations being the one non-item makes the hierarchy asymmetric — items nest
  in items, which sit in locations. Accepted, because the alternative gives a
  room a type and a set of fields nobody would fill in.
- The two-axis state model means a row may have to show two state marks. That
  is a real layout cost, paid deliberately, and it is part of what the badge
  experiment above is deciding how to spend.
