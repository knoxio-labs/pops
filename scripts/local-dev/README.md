# Local development tooling

`mise setup` installs the frozen workspace dependencies, explicitly trusts the
checked-out mise configurations, builds the compiled graph, and typechecks it.
Review repository configuration before running setup. Individual package checks
remain portable and give a missing-build preflight when their compiled imports
are unavailable.

## Checking a change

```sh
mise check -- --plan
mise check
mise check -- --all
mise typecheck
mise check -- --typecheck-only --force
```

The default comparison is the merge base with `origin/main`. `--base <ref>` selects
another branch. Selection includes committed, staged, unstaged and untracked
files, then closes over package reverse dependencies. An internal app change
selects that app; shared libraries select their consumers. Contract changes,
configuration, Rust, missing history and unknown paths select the full workspace.
This conservative fallback also covers vendored contract consumers that are not
package dependencies. Client binaries retain their separate development checks.

Lint and formatting remain workspace checks. Typechecks run with bounded
concurrency (four by default, configurable using `--jobs <n>`). Package test
commands run one at a time because each starts its own Vitest worker pool; this
keeps the total local worker budget bounded. Build/codegen
prerequisites run serially before readers. Failures are collected; failed or
untrusted discovery is an error. A task inherited from root is never treated as a
unit task. `RUN_ALL_INCLUDE_CLIENTS=1` includes standalone client tasks when
explicitly running the general `mise run-all` runner.

`mise typecheck` covers every workspace unit and the root tooling projects. It
builds the SDK before tooling that imports it. Unit mise tasks read each package's
canonical typecheck script, including shell e2e, scripts and root-test projects.
Their no-emit TypeScript checks keep separate incremental files per worktree and
configuration under ignored `tmp/local-dev/typecheck`.

Successful typechecks produce a receipt under `tmp/local-dev/validation`. Reuse
requires matching source contents (including untracked source), generated build
outputs, tool versions, lock/install state, worktree and environment, plus coverage
of every requested unit. Environment values are hashed, never stored or logged;
an exact match also avoids repeating build/codegen prerequisites. Missing or
changed generated output requires a fresh build and check.
Environment-file contents are never read by the cache. Private environment or
local mise override files disable receipt reuse; their contents cannot be
certified without reading them. Incremental compiler checking still runs. A failure or input change
during checking never creates a success receipt. Tests are not cached by this
receipt. Concurrent checks in one worktree are refused. If a process is killed,
verify its recorded PID has stopped before removing its reported lock directory.
`--force` reruns checks; removing the ignored cache is also safe. CI does
not reuse these local receipts.

The push hook refuses a dirty tree before validating the commit being pushed. It
uses the same affected typecheck command and can reuse a preceding successful
check. Lockfile, commit-attribution and pushed-ref checks remain active.

## Development processes

```sh
mise dev -- pillars/shell pillars/finance
mise dev -- @pops/shell @pops/food
POPS_PILLAR_UI_SOURCE=finance mise dev -- pillars/shell
mise dev:ui -- --pillar finance --pillar inventory
```

The supervisor builds prerequisites and starts the selected services and library
watchers together. With no selection it starts all declared dev processes. A
child exiting stops its siblings; termination signals clean up the process tree.
Food starts both its API and worker when selected. Redis and other external
services still need to be available for features that use them.

Source-mode UI runs through the shell's runtime loader and shared providers with
Vite updates. It uses the actual APIs; the existing finance and purchases standalone
mock harnesses remain available through their own `dev:standalone` commands.
Remote mode instead rebuilds selected apps using their existing validated build
command and publishes a completed release atomically. A failed rebuild keeps the
last successful release. The shell reloads on publication, not on partial output.
See the shell README for the two UI workflows.
