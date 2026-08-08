#!/usr/bin/env bash
#
# The Pops scheme's test action against one destination, and the only thing that
# makes running it worth anything: a claim about what it EXECUTED.
#
# `xcodebuild test` exits 0 for a scheme with no testables, for a target whose
# tests all skipped, and for a run that passed — three outcomes, one exit code,
# and only one of them is a pass. Everything below exists to tell them apart.
#
# Two callers, `test:app` and `test:device` in mise.toml, differing in their
# destination and in whether a skip is allowed. They share this file rather than
# each carrying a copy, because the copy that drifts is always the one that
# stops asserting.

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
        -*) die "unknown option '$1'." ;;
        *)
            [ -z "$destination" ] || die "more than one destination given: '$destination', '$1'."
            destination="$1"
            ;;
    esac
    shift
done

[ -n "$destination" ] || die "no destination given." \
    "usage: app-test-lane.sh <xcodebuild destination> [--forbid-skips] [--allow-provisioning-updates]"

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

printf 'app-test-lane: executed %s tests (%s skipped) on %s.\n' "$executed" "$skipped" "$destination"
