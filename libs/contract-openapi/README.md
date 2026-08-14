# @pops/contract-openapi

The OpenAPI projection every TS pillar's `scripts/generate-openapi.ts` calls. A pillar hands it a ts-rest contract and four facts about itself; it writes `openapi/<id>.openapi.json`.

Before this lib the projection was copy-pasted into eleven pillars, and the copies had already drifted: four had dropped the recursive-definition hoist, four had a different `sortJson`, and seven carried the same pair of `as unknown as` casts the escape-hatch ratchet was counting. A fix had to be made eleven times or not at all.

## What a pillar declares

```ts
writePillarOpenApi({
  contract: financeContract,
  packageDir: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  pillarId: 'finance',
  description: "OpenAPI projection of the finance pillar's REST contract. …",
  hoistRecursiveDefinitions: true,
});
```

`info.title` and `info.version` are read off the pillar's own `package.json` rather than passed in; `pillarId` must match the package name (`@pops/<id>`) or the build fails rather than writing a snapshot under the wrong name.

## The two things that are not obvious

**The 3.0 pin.** zod 4's `z.toJSONSchema` emits draft-2020-12, and `@ts-rest/open-api`'s bundled transformer only understands zod 3 (it silently emits empty schemas under zod 4). `zodSchemaTransformer` targets `openapi-3.0` and strips the `$schema` marker, which is what holds the fleet-wide 3.0.x pin — see AGENTS.md, "The OpenAPI version pin". A pillar that emitted 3.1 would break consumer codegen rather than its own build.

**`hoistRecursiveDefinitions` is per pillar on purpose.** zod emits a recursive schema as a nested `definitions` block whose `#/definitions/<id>` refs dangle for an OpenAPI consumer, so the hoist moves them to document-level `components.schemas` and rewrites the refs. Only `inventory` actually has anything to hoist today. But the pass materialises `components.schemas` unconditionally — the six pillars that run it and have no recursive schema carry an empty `components.schemas` in their committed snapshot, and the four that never ran it carry no `components` key at all. That difference is wire-visible, so each pillar states its own answer instead of inheriting a default. Flipping one is a change to that pillar's published document, not a cleanup.

## Who depends on it

Every TS pillar that serves a ts-rest contract, as a `devDependency` — the projection runs at build time and is not in any runtime image: `ai`, `bfm`, `cerebrum`, `documents`, `finance`, `food`, `inventory`, `lists`, `media`, `purchases`, `registry`. The Rust `contacts` pillar generates its document from utoipa and does not use this (ADR-033).

Each of those pillars' Dockerfiles must COPY this lib's manifest and source — a `@pops/*` dependency that is missing from the image's COPY layer breaks the build, and only the `Docker Build` CI job sees it.
