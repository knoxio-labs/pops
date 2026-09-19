#!/usr/bin/env bash
#
# Build the LOCAL flavour of an app and install it on a physical iPhone, beside
# the TestFlight install rather than over it.
#
#   scripts/install-on-phone.sh                  # Pops
#   scripts/install-on-phone.sh PopsPlayground
#   POPS_DEVICE=<name|identifier> scripts/install-on-phone.sh
#   scripts/install-on-phone.sh self-test
#
# The local flavour is the default of every build (see POPS_FLAVOR in
# project.yml): `com.knoxiolabs.pops.local`, a marked icon, "Pops Local" on the
# home screen. This script never names a flavour, and it refuses to install
# anything whose identifier does not end in `.local`, so it cannot replace
# what TestFlight installed.
#
# Release, not Debug: it is the configuration TestFlight ships, and the one
# `build:device` already uses. The BFM host arrives with the pairing QR either
# way. The device is the only paired physical iPhone `devicectl` knows, or the
# one POPS_DEVICE names when there are several.

set -euo pipefail

die() {
    printf 'install-on-phone: %s\n' "$1" >&2
    exit 1
}

# The identifier of the one paired physical iPhone in `devicectl list devices
# --json-output` JSON, or of the device whose name or identifier is <wanted>.
# Takes the JSON as an argument so self-test can feed it fixtures. Paired, not
# "tunnel connected": over the local network the tunnel reads `disconnected`
# until devicectl opens it on demand.
select_device() {
    local json="$1" wanted="${2-}"
    local candidates
    candidates="$(jq -r --arg wanted "$wanted" '
        .result.devices[]
        | select(.hardwareProperties.reality == "physical"
                 and .hardwareProperties.deviceType == "iPhone"
                 and .connectionProperties.pairingState == "paired")
        | select($wanted == "" or .identifier == $wanted or .deviceProperties.name == $wanted)
        | "\(.identifier)\t\(.deviceProperties.name)"' <<<"$json")"
    local count
    count="$(grep -c . <<<"$candidates" || true)"
    if [ "$count" -eq 1 ]; then
        cut -f1 <<<"$candidates"
    elif [ "$count" -eq 0 ] && [ -n "$wanted" ]; then
        die "no paired iPhone named or identified '$wanted'."
    elif [ "$count" -eq 0 ]; then
        die "no paired physical iPhone; connect one (USB or the same network) and trust this Mac."
    else
        die "$count paired iPhones; set POPS_DEVICE to one of: $(cut -f2 <<<"$candidates" | paste -sd, -)."
    fi
}

cmd_install() {
    local scheme="${1:-Pops}"
    case "$scheme" in
        Pops | PopsPlayground) ;;
        *) die "expected 'Pops' or 'PopsPlayground', got '${scheme}'." ;;
    esac
    [ -f Pops.xcodeproj/project.pbxproj ] || die "no Pops.xcodeproj here; run 'mise run generate' in clients/ios first."

    local devices_json
    devices_json="$(mktemp)"
    xcrun devicectl list devices --json-output "$devices_json" >/dev/null
    local device
    device="$(select_device "$(cat "$devices_json")" "${POPS_DEVICE-}")"
    rm -f "$devices_json"

    # Its own derived data, so a device build never evicts the simulator
    # build `mise run test` keeps warm.
    local derived="${POPS_IOS_DERIVED_DATA:-.derived-data}-device"
    xcodebuild build \
        -project Pops.xcodeproj \
        -scheme "$scheme" \
        -configuration Release \
        -destination 'generic/platform=iOS' \
        -derivedDataPath "$derived" \
        -allowProvisioningUpdates \
        -quiet

    local app="$derived/Build/Products/Release-iphoneos/${scheme}.app"
    local bundle_id
    bundle_id="$(plutil -extract CFBundleIdentifier raw -o - "$app/Info.plist")"
    case "$bundle_id" in
        *.local) ;;
        *) die "built $bundle_id, which is not the local flavour; refusing to install over the TestFlight app." ;;
    esac

    xcrun devicectl device install app --device "$device" "$app"

    # A locked phone refuses the launch, not the install; that is a finished
    # install, and reporting it as a failed task misreports what happened.
    local launch_output
    if launch_output="$(xcrun devicectl device process launch --device "$device" "$bundle_id" 2>&1)"; then
        printf 'install-on-phone: %s installed and launched on %s\n' "$bundle_id" "$device"
    elif launch_is_locked "$launch_output"; then
        printf 'install-on-phone: %s installed on %s; not launched because the phone is locked\n' "$bundle_id" "$device"
    else
        printf '%s\n' "$launch_output" >&2
        die "$bundle_id installed on $device, but launching it failed (above)."
    fi
}

# Whether devicectl's launch failure is the phone being locked, from its output.
launch_is_locked() {
    grep -qE 'BSErrorCodeDescription = Locked|could not be, unlocked' <<<"$1"
}

# ---------------------------------------------------------------------------
# self-test — device selection against devicectl-shaped fixtures
# ---------------------------------------------------------------------------

expect() {
    local description="$1"
    shift
    if "$@"; then
        return 0
    fi
    printf 'install-on-phone self-test: %s\n' "$description" >&2
    return 1
}

device_json() {
    local id="$1" name="$2" reality="$3" type="$4" pairing="$5"
    printf '{"identifier":"%s","deviceProperties":{"name":"%s"},"hardwareProperties":{"reality":"%s","deviceType":"%s"},"connectionProperties":{"pairingState":"%s","tunnelState":"disconnected"}}' \
        "$id" "$name" "$reality" "$type" "$pairing"
}

devices() {
    local IFS=,
    printf '{"result":{"devices":[%s]}}' "$*"
}

cmd_self_test() {
    local status=0 out
    local phone sim ipad unpaired other
    phone="$(device_json AAAA JPC physical iPhone paired)"
    sim="$(device_json SSSS 'iPhone 17' simulated iPhone paired)"
    ipad="$(device_json PPPP Tablet physical iPad paired)"
    unpaired="$(device_json UUUU Spare physical iPhone unpaired)"
    other="$(device_json BBBB Work physical iPhone paired)"

    out="$( (select_device "$(devices "$phone" "$sim" "$ipad" "$unpaired")") 2>&1)" || true
    expect "one paired iPhone among a simulator, an iPad and an unpaired phone chose '$out', not AAAA." \
        [ "$out" = AAAA ] || status=1

    out="$( (select_device "$(devices "$sim" "$ipad")") 2>&1)" && status=1
    expect "no physical iPhone did not say so: $out" \
        grep -q 'no paired physical iPhone' <<<"$out" || status=1

    out="$( (select_device "$(devices "$phone" "$other")") 2>&1)" && status=1
    expect "two iPhones did not ask for POPS_DEVICE by name: $out" \
        grep -q 'POPS_DEVICE to one of: JPC,Work' <<<"$out" || status=1

    out="$( (select_device "$(devices "$phone" "$other")" Work) 2>&1)" || true
    expect "POPS_DEVICE=Work chose '$out', not BBBB." [ "$out" = BBBB ] || status=1

    out="$( (select_device "$(devices "$phone" "$other")" BBBB) 2>&1)" || true
    expect "POPS_DEVICE=BBBB chose '$out', not BBBB." [ "$out" = BBBB ] || status=1

    out="$( (select_device "$(devices "$phone")" Nope) 2>&1)" && status=1
    expect "an unknown POPS_DEVICE did not name it: $out" \
        grep -q "named or identified 'Nope'" <<<"$out" || status=1

    # The text devicectl printed on 2026-09-19 when the phone was locked.
    local locked=$'ERROR: The request to launch "PopsPlayground" failed.\n    NSLocalizedFailureReason = Unable to launch com.knoxiolabs.pops.playground.local because the device was not, or could not be, unlocked.\n    BSErrorCodeDescription = Locked'
    expect "a locked-phone launch failure was not recognised." \
        launch_is_locked "$locked" || status=1
    expect "an unrelated launch failure was read as a locked phone." \
        eval '! launch_is_locked "ERROR: The application failed to launch. BSErrorCodeDescription = RequestDenied"' || status=1

    if [ "$status" -eq 0 ]; then
        printf 'install-on-phone: device selection holds for one, none, several and a named phone; a locked phone is told apart.\n'
    fi
    return "$status"
}

# ---------------------------------------------------------------------------

case "${1-}" in
    self-test)
        cmd_self_test
        ;;
    *)
        cmd_install "$@"
        ;;
esac
