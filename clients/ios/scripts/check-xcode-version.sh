#!/usr/bin/env bash
#
# Whether the Xcode running this shell is the one `clients/ios/mise.toml`
# pins for CI, and the message to print when it is not.
#
# `xcrun swift-format --version` cannot answer this question — on a beta
# toolchain it reports the single word "main", not something comparable to
# anything (checked against Xcode 27 Beta 2). `xcodebuild -version` is what
# CI itself parses to select the pinned Xcode (see the "Select the pinned
# Xcode" step in .github/workflows/ios-quality.yml), so this reads the same
# line the same way and is the only thing `mise run lint`'s `verify:xcode-
# version` task calls.
#
# The comparison and the message are split from the two calls that reach the
# real toolchain (`xcodebuild -version`, and installing a wrong Xcode to
# prove the message) so `self-test` can drive both without either — a
# mismatch is not somewhere every contributor's machine can reproduce on
# demand, but the string handling that reports one is.

set -euo pipefail

die() {
    printf 'check-xcode-version: %s\n' "$1" >&2
    shift
    for line in "$@"; do
        printf '                      %s\n' "$line" >&2
    done
    exit 1
}

# "Xcode 26.6\nBuild version 17A5305d" -> "26.6". Takes the tool's stdout as
# an argument rather than shelling out, so self-test can feed it fixtures.
parse_installed_version() {
    awk '/^Xcode / { print $2; exit }' <<<"$1"
}

# The message this file exists to produce, addressed at both versions by
# name — the whole point of POPS-1436 over the silence that preceded it.
report_mismatch() {
    local pinned="$1" actual="$2"
    {
        printf 'check-xcode-version: local Xcode is %s, but clients/ios/mise.toml (and CI) pins %s.\n' \
            "$actual" "$pinned"
        printf '                      swift-format ships inside the toolchain, so this Xcode can\n'
        printf '                      format-lint differently than CI without warning. Install Xcode\n'
        printf '                      %s and switch to it:\n' "$pinned"
        printf '                        sudo xcode-select -s /Applications/Xcode_%s.app/Contents/Developer\n' \
            "$pinned"
    } >&2
}

# ---------------------------------------------------------------------------
# check — the real comparison, against the real toolchain
# ---------------------------------------------------------------------------

cmd_check() {
    local pinned="${1-}"
    if [ -z "$pinned" ]; then
        die "no pinned version given." "usage: check-xcode-version.sh check <version>"
    fi

    local raw
    if ! raw="$(xcodebuild -version 2>&1)"; then
        die "'xcodebuild -version' failed — no Xcode selected, or its license isn't accepted. It printed:" "$raw"
    fi
    local actual
    actual="$(parse_installed_version "$raw")"
    if [ -z "$actual" ]; then
        die "could not read a version out of 'xcodebuild -version'. It printed:" "$raw"
    fi

    if [ "$actual" != "$pinned" ]; then
        report_mismatch "$pinned" "$actual"
        return 1
    fi
}

# ---------------------------------------------------------------------------
# self-test — the parsing and the message, against fixtures
# ---------------------------------------------------------------------------

expect() {
    local description="$1"
    shift
    if "$@"; then
        return 0
    fi
    printf 'check-xcode-version self-test: %s\n' "$description" >&2
    return 1
}

cmd_self_test() {
    local status=0

    # 1. A release toolchain's `xcodebuild -version` parses to its marketing
    #    version, which is the format both `mise.toml`'s pin and CI's runner
    #    directory names use.
    local release
    release="$(parse_installed_version $'Xcode 26.6\nBuild version 17A5305d')"
    expect "parsed 'Xcode 26.6\\nBuild version 17A5305d' as '$release', not '26.6'." \
        [ "$release" = "26.6" ] || status=1

    # 2. A beta toolchain parses the same way — this is the case
    #    `xcrun swift-format --version` cannot handle at all (it prints
    #    "main"), which is the whole reason this script reads `xcodebuild`
    #    instead.
    local beta
    beta="$(parse_installed_version $'Xcode 27.0\nBuild version 27A5209h')"
    expect "parsed a beta 'xcodebuild -version' as '$beta', not '27.0'." \
        [ "$beta" = "27.0" ] || status=1

    # 3. Unparseable output — a toolchain that changed its banner, or a
    #    command that failed silently — yields an empty string rather than a
    #    false match, so `cmd_check` treats it as its own failure instead of
    #    quietly comparing "" to a real pin.
    local empty
    empty="$(parse_installed_version 'Xcode-select: no output')"
    expect "parsed unrecognised output as '$empty' instead of empty." \
        [ -z "$empty" ] || status=1

    # 4. The message names both versions — the acceptance bar for POPS-1436,
    #    not incidental phrasing.
    local message
    message="$(report_mismatch 26.6 27.0 2>&1)" || true
    expect "mismatch message omitted the pinned version (26.6)." \
        grep -q '26\.6' <<<"$message" || status=1
    expect "mismatch message omitted the local version (27.0)." \
        grep -q '27\.0' <<<"$message" || status=1

    if [ "$status" -eq 0 ]; then
        printf 'check-xcode-version: parsing and the mismatch message both hold.\n'
    fi
    return "$status"
}

# ---------------------------------------------------------------------------

case "${1-}" in
    check)
        shift
        cmd_check "$@"
        ;;
    self-test)
        cmd_self_test
        ;;
    *)
        die "unknown mode '${1-}' — expected 'check <version>' or 'self-test'."
        ;;
esac
