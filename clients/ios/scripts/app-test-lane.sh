#!/usr/bin/env bash
#
# The Pops scheme's test action against one destination, and the only thing that
# makes running it worth anything: a claim about what it EXECUTED.
#
# `xcodebuild test` exits 0 for a scheme with no testables, for a target whose
# tests all skipped, and for a run that passed — three outcomes, one exit code,
# and only one of them is a pass. Everything below exists to tell them apart.
#
# Three callers in mise.toml — `test`, `test:app` and `test:device` — differing
# in their destination, in which of the scheme's testables they select, and in
# whether a skip is allowed. They share this file rather than each carrying a
# copy, because the copy that drifts is always the one that stops asserting.

set -euo pipefail

die() {
    printf 'app-test-lane: %s\n' "$1" >&2
    shift
    for line in "$@"; do
        printf '               %s\n' "$line" >&2
    done
    exit 1
}

destination=''
forbid_skips=false
allow_provisioning_updates=false
declare -a only_testing=()
declare -a required=()

while [ "$#" -gt 0 ]; do
    case "$1" in
        # Every test in the target ran. Nothing in the app target skips today;
        # this is what makes a suite that starts skipping argue for itself
        # rather than arrive unnoticed inside a green run. Stated as "nothing
        # skipped" rather than as a list of suite names so it cannot rot when
        # one is renamed.
        --forbid-skips) forbid_skips=true ;;
        # Lets automatic signing register the App ID and fetch a profile, which
        # is what Xcode does on its own when you press Run. A device lane
        # without it fails on a fresh machine with "No profiles for … were
        # found"; a simulator lane needs no signing identity at all.
        --allow-provisioning-updates) allow_provisioning_updates=true ;;
        # Narrows the run to some of the scheme's testables. The scheme carries
        # every package's test target as well as the app's, so the two lanes
        # that are about the app alone say so here rather than each getting a
        # scheme of their own to fall out of sync with this one.
        --only)
            [ "$#" -ge 2 ] || die "--only needs a test target name."
            only_testing+=("$2")
            shift
            ;;
        # A testable that must appear in the result bundle. `--forbid-skips`
        # cannot see a target that never reported at all: a testable dropped
        # from the scheme, or filtered out by a stale `--only`, leaves a result
        # bundle that is smaller but entirely healthy-looking, with a passing
        # count for everything that did run. Named rather than counted so the
        # message can say which one is missing.
        --require-testable)
            [ "$#" -ge 2 ] || die "--require-testable needs a test target name."
            required+=("$2")
            shift
            ;;
        -*) die "unknown option '$1'." ;;
        *)
            [ -z "$destination" ] || die "more than one destination given: '$destination', '$1'."
            destination="$1"
            ;;
    esac
    shift
done

[ -n "$destination" ] || die "no destination given." \
    "usage: app-test-lane.sh <xcodebuild destination> [--forbid-skips]" \
    "       [--allow-provisioning-updates] [--only <target>]…" \
    "       [--require-testable <target>]…"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
result="$work/test.xcresult"

declare -a xcodebuild_args=(
    test
    -project Pops.xcodeproj
    -scheme Pops
    -destination "$destination"
    -resultBundlePath "$result"
)
for target in ${only_testing+"${only_testing[@]}"}; do
    xcodebuild_args+=("-only-testing:$target")
done
if [ "$allow_provisioning_updates" = true ]; then
    xcodebuild_args+=(-allowProvisioningUpdates)
fi

status=0
xcodebuild "${xcodebuild_args[@]}" > "$work/test.log" 2>&1 || status=1

# A run that died before producing a bundle has no count to report, and the
# reason is in the log rather than in anything below.
if [ ! -e "$result" ]; then
    tail -60 "$work/test.log" >&2
    die "xcodebuild produced no result bundle."
fi

if ! summary="$(xcrun xcresulttool get test-results summary --path "$result")"; then
    tail -60 "$work/test.log" >&2
    die "could not read a summary out of the result bundle."
fi

if [ "$status" -ne 0 ]; then
    tail -60 "$work/test.log" >&2
    # `// []` because a build failure produces a bundle with no failed *tests*
    # in it. Without it jq aborts on `null[]`, replacing the failure this branch
    # exists to report with a jq error about reporting it.
    jq -r '(.testFailures // [])[] | "FAILED  \(.testName): \(.failureText // "no message")"' \
        <<<"$summary" >&2
    exit 1
fi

# Absence is a failure, not a pass — a summary with no counts in it would make
# the guards below compare nothing against zero and wave the run through.
total="$(jq -r '.totalTestCount // empty' <<<"$summary")"
skipped="$(jq -r '.skippedTests // empty' <<<"$summary")"
if [ -z "$total" ] || [ -z "$skipped" ]; then
    die "the result bundle reports no test counts, so nothing here is checking anything."
fi

executed=$((total - skipped))

# The defect the app test target was created for. A lane that runs nothing and
# reports success is worse than no lane: it is a green signal for an empty set,
# and nobody re-reads a green check. Skipped tests count towards the total the
# bundle reports, so subtracting them is what makes this a claim about what
# executed rather than about what was collected.
if [ "$executed" -le 0 ]; then
    die "the test action executed 0 tests ($total collected, $skipped skipped)." \
        "Check that project.yml still lists PopsTests under the Pops scheme."
fi

if [ "$forbid_skips" = true ] && [ "$skipped" -ne 0 ]; then
    die "$skipped of $total tests skipped, and this lane exists to run them." \
        "A suite that skips itself inside a passing run is indistinguishable from" \
        "one that ran, by every signal except this count."
fi

# Which test bundles reported, read back out of the result rather than inferred
# from what was asked for. `nodeType` is matched on its "… test bundle" suffix
# so a unit bundle and a UI bundle both count; the tree is walked recursively
# because where a bundle sits under the plan is xcresulttool's business, not
# this script's.
if ! tests="$(xcrun xcresulttool get test-results tests --path "$result")"; then
    die "could not read the test tree out of the result bundle."
fi
ran="$(jq -r '[.. | objects | select((.nodeType? // "") | endswith("test bundle"))
    | (.name? // empty) | sub("\\.xctest$"; "")] | unique | .[]' <<<"$tests")"
if [ -z "$ran" ]; then
    printf '%s\n' "$tests" | head -40 >&2
    die "the result bundle names no test bundles, so the check below would" \
        "have compared every requirement against an empty set."
fi

printf 'app-test-lane: bundles that reported: %s\n' "$(paste -sd' ' - <<<"$ran")"

absent=''
for target in ${required+"${required[@]}"}; do
    grep -qxF "${target%.xctest}" <<<"$ran" || absent="$absent $target"
done
if [ -n "$absent" ]; then
    die "required testable(s) never reported:$absent." \
        "The run passed, but those targets contributed nothing to it — check" \
        "the Pops scheme in project.yml still names them under testTargets."
fi

printf 'app-test-lane: executed %s tests (%s skipped) on %s.\n' "$executed" "$skipped" "$destination"
