#!/bin/sh
set -eu

: "${CONFIGURATION:?}"
: "${SDK_NAME:?}"
: "${SRCROOT:?}"
: "${DERIVED_FILE_DIR:?}"

source_info="$SRCROOT/App/Info.plist"
output_info="$DERIVED_FILE_DIR/Pops-Info.plist"

mkdir -p "$DERIVED_FILE_DIR"
cp "$source_info" "$output_info"

if [ "$CONFIGURATION" = Debug ]; then
    case "$SDK_NAME" in
        iphonesimulator*)
            if ! /usr/libexec/PlistBuddy -c 'Print :NSAppTransportSecurity' "$output_info" >/dev/null 2>&1; then
                /usr/libexec/PlistBuddy -c 'Add :NSAppTransportSecurity dict' "$output_info"
            fi
            if /usr/libexec/PlistBuddy -c 'Print :NSAppTransportSecurity:NSAllowsLocalNetworking' "$output_info" >/dev/null 2>&1; then
                /usr/libexec/PlistBuddy -c 'Delete :NSAppTransportSecurity:NSAllowsLocalNetworking' "$output_info"
            fi
            /usr/libexec/PlistBuddy -c 'Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true' "$output_info"
            ;;
    esac
fi

if /usr/libexec/PlistBuddy -c 'Print :NSAppTransportSecurity:NSAllowsArbitraryLoads' "$output_info" 2>/dev/null | grep -qx true; then
    echo 'The app Info.plist must not allow arbitrary loads.' >&2
    exit 1
fi

if [ "$CONFIGURATION" != Debug ] || ! printf '%s' "$SDK_NAME" | grep -q '^iphonesimulator'; then
    if /usr/libexec/PlistBuddy -c 'Print :NSAppTransportSecurity:NSAllowsLocalNetworking' "$output_info" 2>/dev/null | grep -qx true; then
        echo 'Local networking is permitted only in Debug simulator builds.' >&2
        exit 1
    fi
fi

plutil -lint "$output_info" >/dev/null
