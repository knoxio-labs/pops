#!/usr/bin/env bash

set -euo pipefail

readonly PACKAGE_NAME="SwiftCollections"
readonly PACKAGE_URL="https://github.com/apple/swift-collections"
readonly PACKAGE_VERSION="1.6.0"

die() {
    printf 'check-app-package-pin: %s\n' "$1" >&2
    exit 1
}

package_field() {
    local field="$1"
    awk -v package="$PACKAGE_NAME" -v field="$field" '
        $0 == "  " package ":" {
            in_package = 1
            next
        }
        in_package && /^  [A-Za-z0-9_-]+:/ {
            exit
        }
        in_package {
            line = $0
            sub(/^[[:space:]]+/, "", line)
            if (line ~ "^" field ":[[:space:]]*") {
                sub("^" field ":[[:space:]]*", "", line)
                gsub(/^[\047"]|[\047"]$/, "", line)
                print line
                exit
            }
        }
    '
}

verdict() {
    local project="$1"
    local url version
    url="$(package_field url <<<"$project")"
    version="$(package_field exactVersion <<<"$project")"

    [ "$url" = "$PACKAGE_URL" ] ||
        die "$PACKAGE_NAME must resolve from $PACKAGE_URL, found '${url:-no URL}'."
    [ "$version" = "$PACKAGE_VERSION" ] ||
        die "$PACKAGE_NAME must use exactVersion $PACKAGE_VERSION, found '${version:-no exactVersion}'. See POPS-5044."
}

cmd_check() {
    local project_file="${1-}"
    [ -f "$project_file" ] || die "'$project_file' is not a project specification."
    verdict "$(<"$project_file")"
}

passes() { ("$@") >/dev/null 2>&1; }
rejects() { ! ("$@") >/dev/null 2>&1; }

cmd_self_test() {
    local exact floating wrong_url missing
    exact=$'packages:\n  SwiftCollections:\n    url: https://github.com/apple/swift-collections\n    exactVersion: 1.6.0\n  AppCore:\n    path: Packages/AppCore'
    floating=$'packages:\n  SwiftCollections:\n    url: https://github.com/apple/swift-collections\n    from: 1.6.0'
    wrong_url=$'packages:\n  SwiftCollections:\n    url: https://example.invalid/swift-collections\n    exactVersion: 1.6.0'
    missing=$'packages:\n  AppCore:\n    path: Packages/AppCore'

    passes verdict "$exact" || die "the exact 1.6.0 fixture was rejected."
    rejects verdict "$floating" || die "a floating package requirement was accepted."
    rejects verdict "$wrong_url" || die "the wrong package URL was accepted."
    rejects verdict "$missing" || die "a missing app-level package constraint was accepted."

    printf 'check-app-package-pin: only the tracked Swift Collections 1.6.0 exact pin passes.\n'
}

case "${1-}" in
    check)
        shift
        cmd_check "$@"
        ;;
    self-test)
        cmd_self_test
        ;;
    *)
        die "unknown mode '${1-}' — expected 'check <project.yml>' or 'self-test'."
        ;;
esac
