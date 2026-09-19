#!/usr/bin/env bash
#
# The version a TestFlight build of a commit carries, as the two build
# settings `xcodebuild` takes on its command line:
#
#   MARKETING_VERSION=2026.9.19        CFBundleShortVersionString
#   CURRENT_PROJECT_VERSION=4821       CFBundleVersion
#
# CalVer from the commit's COMMITTER date in UTC, never the clock of the run
# building it, so re-running a commit reproduces its version. No leading
# zeros: App Store Connect wants up to three period-separated integers, and a
# zero-padded component is one parse away from being read as something else.
# The committer date rather than the author date because a squash-merge
# through the queue stamps the committer date at merge time, while the author
# date is whenever the first commit on the branch was written.
#
# The build number is the commit count. `main` is linear — the merge queue
# squashes — so the count only goes up along it and names exactly one commit.
# A shallow clone makes that count wrong while still looking like a number,
# so a shallow repository is refused rather than answered.
#
# Nothing here is committed back to the tree: the ruleset forbids pushing to
# `main`, which is also why `.github/scripts/release.sh` is tag-only.

set -euo pipefail

die() {
    printf 'release-version: %s\n' "$1" >&2
    exit 1
}

# Prints the two lines for <sha> in the repository at <dir>, or fails.
release_version() {
    local dir="$1" sha="$2"

    [ "$(git -C "$dir" rev-parse --is-shallow-repository)" = "false" ] ||
        die "$dir is a shallow clone, so the commit count is wrong; fetch with full history (actions/checkout fetch-depth: 0)."

    local commit
    commit="$(git -C "$dir" rev-parse --verify --quiet "${sha}^{commit}")" ||
        die "'$sha' does not name a commit in $dir."

    local year month day
    read -r year month day < <(
        TZ=UTC git -C "$dir" show -s --date='format-local:%Y %m %d' --format=%cd "$commit"
    )
    local count
    count="$(git -C "$dir" rev-list --count "$commit")"

    printf 'MARKETING_VERSION=%d.%d.%d\n' "$((10#$year))" "$((10#$month))" "$((10#$day))"
    printf 'CURRENT_PROJECT_VERSION=%d\n' "$count"
}

# ---------------------------------------------------------------------------
# self-test — a throwaway repository with pinned committer dates
# ---------------------------------------------------------------------------

expect() {
    local description="$1"
    shift
    if "$@"; then
        return 0
    fi
    printf 'release-version self-test: %s\n' "$description" >&2
    return 1
}

# Fails unless the call exits non-zero AND says <reason>: a refusal that only
# happens because something later crashed is not the refusal being tested.
# A subshell because `die` exits, and a refusal must end the call, not the test.
refuses() {
    local reason="$1" stderr
    shift
    if stderr="$( ("$@") 2>&1 >/dev/null)"; then
        return 1
    fi
    grep -qF "$reason" <<<"$stderr"
}

fixture_commit() {
    local dir="$1" author_date="$2" committer_date="$3"
    GIT_AUTHOR_DATE="$author_date" GIT_COMMITTER_DATE="$committer_date" \
        git -C "$dir" -c user.name=fixture -c user.email=fixture@example.invalid \
        -c commit.gpgsign=false commit -q --allow-empty --no-verify -m fixture
    git -C "$dir" rev-parse HEAD
}

cmd_self_test() {
    local status=0 work
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' RETURN

    local repo="$work/repo"
    git init -q "$repo"

    # 1. Single-digit month and day come out unpadded.
    local first
    first="$(fixture_commit "$repo" 2026-09-05T10:00:00+00:00 2026-09-05T10:00:00+00:00)"
    local out
    out="$(release_version "$repo" "$first")"
    expect "first commit printed '$out', not 2026.9.5 build 1." \
        [ "$out" = $'MARKETING_VERSION=2026.9.5\nCURRENT_PROJECT_VERSION=1' ] || status=1

    # 2. 23:30 in Chicago is 04:30 the next day in UTC, and the author date is
    #    months earlier: the version follows the committer date, in UTC, even
    #    when the shell running this is in neither.
    local second
    second="$(fixture_commit "$repo" 2026-01-01T12:00:00+00:00 2026-09-19T23:30:00-05:00)"
    out="$(TZ=America/Chicago release_version "$repo" "$second")"
    expect "near-midnight commit printed '$out', not 2026.9.20 build 2." \
        [ "$out" = $'MARKETING_VERSION=2026.9.20\nCURRENT_PROJECT_VERSION=2' ] || status=1

    # 3. Two-digit components are not truncated by the zero-stripping.
    local third
    third="$(fixture_commit "$repo" 2026-12-31T23:59:59+00:00 2026-12-31T23:59:59+00:00)"
    out="$(release_version "$repo" "$third")"
    expect "year-end commit printed '$out', not 2026.12.31 build 3." \
        [ "$out" = $'MARKETING_VERSION=2026.12.31\nCURRENT_PROJECT_VERSION=3' ] || status=1

    # 4. An earlier commit keeps its own number after later ones land.
    out="$(release_version "$repo" "$first")"
    expect "first commit re-read as '$out' after later commits, not build 1." \
        [ "$out" = $'MARKETING_VERSION=2026.9.5\nCURRENT_PROJECT_VERSION=1' ] || status=1

    # 5. A sha that names nothing is refused, not answered.
    expect "an unknown sha was answered instead of refused." \
        refuses "does not name a commit" release_version "$repo" deadbeefdeadbeefdeadbeefdeadbeefdeadbeef || status=1

    # 6. A shallow clone is refused: its count for the tip would be 1.
    local shallow="$work/shallow"
    git clone -q --depth 1 "file://$repo" "$shallow"
    expect "a shallow clone was answered instead of refused." \
        refuses "is a shallow clone" release_version "$shallow" "$third" || status=1

    if [ "$status" -eq 0 ]; then
        printf 'release-version: CalVer, UTC committer date, commit count and both refusals hold.\n'
    fi
    return "$status"
}

# ---------------------------------------------------------------------------

case "${1-}" in
    self-test)
        cmd_self_test
        ;;
    "")
        die "expected '<sha>' or 'self-test'."
        ;;
    *)
        release_version "$(pwd)" "$1"
        ;;
esac
