# Extractability sandbox

The TypeScript EX-2 sandbox copies a unit at its original repository depth, replaces `@pops/*` workspace dependencies with packed artifacts, installs the unit's declared dependencies, and runs its build or typecheck. Its local workspace file prevents pnpm from resolving dependencies from the checkout.

Monorepo tooling has explicit sandbox providers. When a unit's source uses `oxfmt` or depends on `@pops/contract-openapi`, the sandbox adds the version of `oxfmt` declared in the root `package.json` to the extracted unit. The build-graph guard and its dependency are copied to the relative paths used by package scripts. The root `tsconfig.base.json` is also placed at the path those configs expect. `pack-deps.mjs` has already built each packed `@pops/*` dependency, and the extracted unit's build and typecheck verify those artifacts.

Other package-script commands that reach outside the unit are rejected before dependency packing. The error names the unprovided tool so the package or sandbox can declare an explicit provider.
