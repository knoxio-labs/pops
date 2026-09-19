#!/usr/bin/env bash
#
# Whether a built .app that links a camera framework says why it wants the
# camera, checked BEFORE the upload rather than learned from App Store Connect.
#
#   scripts/check-camera-purpose.sh check path/to/Some.app
#   scripts/check-camera-purpose.sh self-test
#
# App Store Connect rejects such a build after processing it (ITMS-90683,
# "Missing purpose string in Info.plist"), by email, with the upload already
# reported as a success. It judges the binary, not the code paths a user can
# reach: PopsPlayground never opens a camera, but it stages the real pairing
# and receipt-capture screens, so it links AVFoundation and VisionKit through
# AppCore and FeatureReceiptCapture, and build 3289 was rejected for it.
#
# Linking is the test here because it is what can be read from a binary without
# disassembling it. It is stricter than Apple's symbol-level check — an app
# linking AVFoundation only for playback would be told to declare a purpose it
# does not have — and that is the direction to be wrong in: the cost is one
# string in project.yml, against a build that silently never reaches testers.

set -euo pipefail

die() {
    printf 'check-camera-purpose: %s\n' "$1" >&2
    exit 1
}

# The camera frameworks named in `otool -L` output, one per line. Takes the
# output as an argument so self-test can feed it fixtures.
camera_frameworks() {
    grep -oE '/System/Library/Frameworks/(AVFoundation|VisionKit)\.framework/' <<<"$1" |
        sed -E 's|.*/([A-Za-z]+)\.framework/|\1|' | sort -u || true
}

# Fails, naming <app>, when <linked> names a camera framework and <purpose> is
# empty or whitespace.
verdict() {
    local app="$1" linked="$2" purpose="$3"
    local frameworks
    frameworks="$(camera_frameworks "$linked" | paste -sd, -)"
    [ -n "$frameworks" ] || return 0
    [ -n "${purpose//[[:space:]]/}" ] ||
        die "$app links ${frameworks} but its Info.plist has no NSCameraUsageDescription; App Store Connect rejects that build (ITMS-90683). Set INFOPLIST_KEY_NSCameraUsageDescription on its target in project.yml."
}

cmd_check() {
    local app="${1-}"
    [ -d "$app" ] || die "'$app' is not an app bundle."
    local plist="$app/Info.plist"
    local executable
    executable="$(plutil -extract CFBundleExecutable raw -o - "$plist")"
    local purpose
    purpose="$(plutil -extract NSCameraUsageDescription raw -o - "$plist" 2>/dev/null || true)"
    verdict "$(basename "$app")" "$(otool -L "$app/$executable")" "$purpose"
}

# ---------------------------------------------------------------------------
# self-test — the verdict against `otool -L` fixtures
# ---------------------------------------------------------------------------

expect() {
    local description="$1"
    shift
    if "$@"; then
        return 0
    fi
    printf 'check-camera-purpose self-test: %s\n' "$description" >&2
    return 1
}

# A subshell because `die` exits; a rejection must end the call, not the test.
passes() { ("$@") >/dev/null 2>&1; }
rejects() { ! ("$@") >/dev/null 2>&1; }

cmd_self_test() {
    local status=0
    # The shape of the lines PopsPlayground build 3289 actually produced.
    local av=$'\t/System/Library/Frameworks/AVFoundation.framework/AVFoundation (compatibility version 1.0.0, current version 2.0.0)'
    local vk=$'\t/System/Library/Frameworks/VisionKit.framework/VisionKit (compatibility version 1.0.0, current version 1.0.0)'
    local swift_av=$'\t/usr/lib/swift/libswiftAVFoundation.dylib (compatibility version 1.0.0, current version 2450.63.2, weak)'
    local ui=$'\t/System/Library/Frameworks/UIKit.framework/UIKit (compatibility version 1.0.0, current version 9126.2.4)'
    local purpose='Pops Design previews the camera screens.'

    expect "build 3289's shape (AVFoundation + VisionKit, no purpose) was accepted." \
        rejects verdict App "$ui"$'\n'"$av"$'\n'"$vk"$'\n'"$swift_av" '' || status=1
    expect "VisionKit alone with no purpose was accepted." \
        rejects verdict App "$ui"$'\n'"$vk" '' || status=1
    expect "a whitespace-only purpose was accepted." \
        rejects verdict App "$av" $'  \n\t' || status=1
    expect "a camera app WITH a purpose was rejected." \
        passes verdict App "$av"$'\n'"$vk" "$purpose" || status=1
    expect "an app linking no camera framework was rejected for having no purpose." \
        passes verdict App "$ui" '' || status=1
    # The Swift overlay's path is not the framework; alone it proves nothing,
    # and matching it would make the framework pattern meaningless.
    expect "the libswiftAVFoundation overlay alone was read as a camera framework." \
        passes verdict App "$swift_av" '' || status=1

    local message
    message="$(verdict PopsPlayground.app "$av"$'\n'"$vk" '' 2>&1)" || true
    expect "the rejection does not name the app, both frameworks and the key: $message" \
        grep -q 'PopsPlayground.app links AVFoundation,VisionKit .*NSCameraUsageDescription' <<<"$message" || status=1

    if [ "$status" -eq 0 ]; then
        printf 'check-camera-purpose: camera-linking apps without a purpose are rejected, everything else passes.\n'
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
        die "unknown mode '${1-}' — expected 'check <app>' or 'self-test'."
        ;;
esac
