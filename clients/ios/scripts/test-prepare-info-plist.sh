#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ios_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
repo_root=$(CDPATH= cd -- "$ios_dir/../.." && pwd)

mkdir -p "$repo_root/tmp"
work=$(mktemp -d "$repo_root/tmp/simulator-ats test.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM

check_mode() {
    configuration=$1
    sdk_name=$2
    expect_local_networking=$3
    destination="$work/$configuration-$sdk_name"
    mkdir -p "$destination"

    CONFIGURATION="$configuration" SDK_NAME="$sdk_name" SRCROOT="$ios_dir" DERIVED_FILE_DIR="$destination" \
        "$script_dir/prepare-info-plist.sh"
    output_info="$destination/Pops-Info.plist"
    /usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes' "$output_info" >/dev/null

    if [ "$expect_local_networking" = true ]; then
        /usr/libexec/PlistBuddy -c 'Print :NSAppTransportSecurity:NSAllowsLocalNetworking' "$output_info" | grep -qx true
    elif /usr/libexec/PlistBuddy -c 'Print :NSAppTransportSecurity:NSAllowsLocalNetworking' "$output_info" >/dev/null 2>&1; then
        echo "$configuration $sdk_name unexpectedly permits local networking." >&2
        exit 1
    fi

    if /usr/libexec/PlistBuddy -c 'Print :NSAppTransportSecurity:NSAllowsArbitraryLoads' "$output_info" >/dev/null 2>&1; then
        echo "$configuration $sdk_name unexpectedly sets NSAllowsArbitraryLoads." >&2
        exit 1
    fi

    first_hash=$(shasum -a 256 "$output_info" | awk '{print $1}')
    CONFIGURATION="$configuration" SDK_NAME="$sdk_name" SRCROOT="$ios_dir" DERIVED_FILE_DIR="$destination" \
        "$script_dir/prepare-info-plist.sh"
    second_hash=$(shasum -a 256 "$output_info" | awk '{print $1}')
    if [ "$first_hash" != "$second_hash" ]; then
        echo "$configuration $sdk_name plist generation is not repeatable." >&2
        exit 1
    fi
}

check_mode Debug iphonesimulator27.0 true
check_mode Debug iphoneos27.0 false
check_mode Release iphonesimulator27.0 false
check_mode Release iphoneos27.0 false

echo 'Info.plist ATS policy is scoped to Debug simulator builds.'
