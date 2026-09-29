#!/usr/bin/env bash
set -euo pipefail

log="$POPS_IOS_COMPILER_LOG"

# Absence is a failure, not a pass — the same rule as everything else here. A
# missing log would otherwise reach `swiftlint analyze` as an empty one and
# report zero violations over zero files.
if [ ! -s "$log" ]; then
  echo "lint:analyze: no compiler log at $log. 'mise run build:for-testing'" >&2
  echo "              writes it; without one these two rules see nothing." >&2
  exit 1
fi

if [ -n "${POPS_IOS_ANALYZER_ARTIFACTS:-}" ]; then
  artifacts="$POPS_IOS_ANALYZER_ARTIFACTS"
  mkdir -p "$artifacts"
else
  scratch="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)/tmp"
  mkdir -p "$scratch"
  artifacts=$(mktemp -d "$scratch/ios-analyzer.XXXXXX")
fi
cp "$log" "$artifacts/compiler.log"
output_log="$artifacts/analyze.log"
printf 'lint:analyze: streaming analyzer output to %s\n' "$output_log"
set +e
swiftlint analyze --strict --compiler-log-path "$log" --config .swiftlint.yml \
  <&0 >"$output_log" 2>&1 &
analyzer_pid=$!
tail -n +1 -F "$output_log" &
tail_pid=$!
wait "$analyzer_pid"
status=$?
kill "$tail_pid" 2>/dev/null
wait "$tail_pid" 2>/dev/null || true
set -e

# Same reasoning as app-test-lane.sh's executed-test count: absence is a
# failure, not a pass. A log with nothing usable in it reports zero
# violations in zero files, which reads exactly like a clean pass unless
# something reads the file count back out and refuses to call zero a result.
#
# Zero is not the only shape that lies, though — a log covering half the
# repo still reports a healthy, nonzero count for the half it did see, which
# is exactly how this task shipped blind to every package's `Tests/` in the
# first place. So the floor below is the tree itself, read back out fresh on
# every run, rather than a constant: a future regression of the same shape (a
# target quietly dropped from the log again) fails here instead of reading as
# a second clean pass.
#
# The floor is `App`, `AppTests` and `Packages` — not `Tools`, though
# `.swiftlint.yml`'s `included:` names that too. `Tools/generate-device-
# signature-fixture.swift` is a loose script run by hand via `swift <path>`,
# never a member of any target the app, `PopsTests` or a package builds — no
# compiler log this task can produce will ever name it, so counting it here
# would fail this guard forever. `swiftlint lint` still lints it straight
# from source; only the analyzer rules, which need a build, cannot reach it.
#
# Counted by hand here rather than through `scripts/swift-sources.sh list`,
# on purpose: that script enumerates the FORMATTER's file set, which now
# also drops any file whose first line is a shebang — a distinction that
# exists for `swift-format` alone and means nothing to `swiftlint lint` or
# to `.swiftlint.yml`'s `included:`/`excluded:`. Reusing it here would let
# this floor silently track a different tool's notion of scope, which is the
# exact failure this task exists to close, one layer further in. `.build`,
# `Generated` and `Package.swift` are excluded because `.swiftlint.yml`
# excludes them too — the same reasoning as CGFloat's `always_keep_imports`
# entry in that file: build configuration and generated code are not the
# application code these two rules are about.
analyzed=$(sed -nE 's/.*in ([0-9]+) files\.$/\1/p' "$output_log" | tail -1)
# `sed -E '/pattern/d'` rather than `grep -vE`: under `set -o pipefail`, `grep`
# exits 1 when nothing matches (here: no non-Package.swift file at all), which
# would abort this pipeline before the guard below ever runs and replace its
# message with a bare pipeline failure. `sed` exits 0 regardless of how many
# lines it deleted, so an empty result still reaches the check as $total=0.
total=$(find App AppTests Packages \
    \( -name .build -o -name Generated \) -type d -prune \
    -o -type f -name '*.swift' -print \
  | sed -E '/^Packages\/[^/]+\/Package\.swift$/d' \
  | wc -l | tr -d ' ')
if [ -z "$analyzed" ] || [ "$analyzed" -lt "$total" ]; then
  echo "lint:analyze: analyzed ${analyzed:-0} file(s), but $total live under" >&2
  echo "              App, AppTests and Packages (excluding Package.swift) —" >&2
  echo "              the compiler log did not cover the whole tree." >&2
  exit 1
fi

exit "$status"
