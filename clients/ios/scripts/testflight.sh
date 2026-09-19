#!/usr/bin/env bash
#
# Archive one app scheme at HEAD, sign it for App Store Connect and upload it,
# where TestFlight hands it to the app's internal testing group.
#
#   scripts/testflight.sh Pops
#   scripts/testflight.sh PopsPlayground
#
# Reads, and never prints:
#   DEVELOPMENT_TEAM   the Apple team (not in the tree: the repo is public)
#   ASC_KEY_ID         App Store Connect API key id
#   ASC_ISSUER_ID      App Store Connect API issuer id
#   ASC_KEY_PATH       path to that key's .p8
#
# Signing is automatic with the API key standing in for a signed-in Xcode:
# `-allowProvisioningUpdates` lets xcodebuild create or fetch the cloud-managed
# distribution certificate and the App Store profile itself, so no .p12 or
# profile lives in a secret. The version is HEAD's CalVer, passed as build
# settings so nothing is committed (see scripts/release-version.sh).

set -euo pipefail

die() {
    printf 'testflight: %s\n' "$1" >&2
    exit 1
}

scheme="${1-}"
case "$scheme" in
    Pops | PopsPlayground) ;;
    *) die "expected 'Pops' or 'PopsPlayground', got '${scheme}'." ;;
esac

for name in DEVELOPMENT_TEAM ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH; do
    [ -n "${!name-}" ] || die "$name is not set."
done
[ -f "$ASC_KEY_PATH" ] || die "ASC_KEY_PATH does not name a file."
[ -f Pops.xcodeproj/project.pbxproj ] || die "no Pops.xcodeproj here; run 'mise run generate' in clients/ios first."

versions="$(scripts/release-version.sh HEAD)"
marketing_version="$(sed -n 's/^MARKETING_VERSION=//p' <<<"$versions")"
build_number="$(sed -n 's/^CURRENT_PROJECT_VERSION=//p' <<<"$versions")"
printf 'testflight: %s %s (%s) from %s\n' "$scheme" "$marketing_version" "$build_number" "$(git rev-parse --short HEAD)"

work="${RUNNER_TEMP:-$(mktemp -d)}/testflight-${scheme}"
rm -rf "$work"
mkdir -p "$work"
archive="$work/${scheme}.xcarchive"

auth=(
    -allowProvisioningUpdates
    -authenticationKeyPath "$ASC_KEY_PATH"
    -authenticationKeyID "$ASC_KEY_ID"
    -authenticationKeyIssuerID "$ASC_ISSUER_ID"
)

xcodebuild archive \
    -project Pops.xcodeproj \
    -scheme "$scheme" \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "$archive" \
    "${auth[@]}" \
    DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
    MARKETING_VERSION="$marketing_version" \
    CURRENT_PROJECT_VERSION="$build_number"

# The version is read back from the archive rather than trusted: a target that
# sets either key where a command-line setting cannot reach it (a literal in an
# Info.plist, say) would upload under a number this script never chose.
built_plist="$archive/Products/Applications/$(
    /usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:ApplicationPath' "$archive/Info.plist" |
        sed 's|^Applications/||'
)/Info.plist"
built_marketing="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$built_plist")"
built_build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$built_plist")"
[ "$built_marketing" = "$marketing_version" ] && [ "$built_build" = "$build_number" ] ||
    die "archive carries $built_marketing ($built_build), expected $marketing_version ($build_number)."

# App Store Connect accepts the upload and only rejects a missing purpose
# string after processing, by email; refusing here keeps it a red run.
scripts/check-camera-purpose.sh check "$(dirname "$built_plist")"

# manageAppVersionAndBuildNumber is off because App Store Connect would
# otherwise be free to renumber the build, and the number is how a build on a
# phone is traced back to its commit.
options="$work/ExportOptions.plist"
cat >"$options" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>destination</key>
    <string>upload</string>
    <key>teamID</key>
    <string>${DEVELOPMENT_TEAM}</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>manageAppVersionAndBuildNumber</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
</dict>
</plist>
PLIST

xcodebuild -exportArchive \
    -archivePath "$archive" \
    -exportPath "$work/export" \
    -exportOptionsPlist "$options" \
    "${auth[@]}"

printf 'testflight: uploaded %s %s (%s)\n' "$scheme" "$marketing_version" "$build_number"
