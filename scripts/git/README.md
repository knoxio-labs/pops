# Git merge drivers

`.gitattributes` routes every TypeScript, JavaScript, JSON, YAML, TOML and Rust
path through [mergiraf](https://mergiraf.org), which merges on the syntax tree.
Two branches that each add an entry to the same import list, object literal or
array no longer conflict. Mergiraf has no Swift grammar, so Swift merges as text.
`pnpm-lock.yaml` is pinned to the text driver: regenerate a conflicting lockfile
with `pnpm install` instead of merging it.

The binary is pinned in the root `mise.toml`; `mise install` provides it.

Git reads merge-driver commands only from local config, never from the
repository. `install-merge-drivers.mjs` writes that config. It runs from the
root `prepare` script, from `mise setup` and from the pre-commit hook. Existing
clones therefore pick it up on their next commit, since pnpm skips `prepare`
when the install is already up to date. Rerunning it writes nothing.

The driver degrades to git's own line merge, with ordinary conflict markers,
when:

- the clone has no driver config, because git then ignores the attribute;
- `mergiraf-merge.sh` finds no `mergiraf`, neither on PATH nor through
  `mise which`;
- mergiraf exits with anything other than 0 (clean) or 1 (conflicts written).
  The wrapper first restores our side, so a partial write cannot survive.

A failed driver command would otherwise leave our side in place with no
markers, so the wrapper never lets that happen. `__tests__/merge-drivers.test.ts`
covers each fallback against a real temporary repository.

Review what mergiraf resolved with the `mergiraf review <file>_<id>` command it
prints during the merge.
