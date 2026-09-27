#!/usr/bin/env bash

set -euo pipefail

die() {
    printf 'check-app-test-linkage: %s\n' "$1" >&2
    exit 1
}

target_block() {
    awk '
        $0 == "  PopsTests:" { found = 1 }
        found && $0 != "  PopsTests:" && /^  [A-Za-z0-9_-]+:/ { exit }
        found { print }
    ' "$1"
}

project_verdict() {
    local target="$1" imports="$2"

    grep -qxF '      - Packages/AppCore/Sources/AppCoreFakes' <<<"$target" ||
        die "PopsTests must compile the canonical AppCoreFakes sources directly."
    ! grep -q 'product: AppCoreFakes' <<<"$target" ||
        die "PopsTests must not link the AppCoreFakes product; it carries a second static AppCore."
    awk '
        $0 == "      - package: AppCore" { dependency = 1; next }
        dependency && $0 == "        link: false" { import_only = 1; exit }
        dependency && /^      - / { exit }
        END { exit !import_only }
    ' <<<"$target" || die "PopsTests must keep AppCore as an import-only dependency."
    [ -z "$imports" ] ||
        die "AppTests must use the fake sources compiled into PopsTests, not import AppCoreFakes: $imports"
}

link_verdict() {
    local host="$1" tests="$2"
    local host_appcore test_appcore test_fakes
    host_appcore="$(grep -Ec '/AppCore\.o$' <<<"$host" || true)"
    test_appcore="$(grep -Ec '/AppCore\.o$' <<<"$tests" || true)"
    test_fakes="$(grep -Ec '/AppCoreFakes\.o$' <<<"$tests" || true)"

    [ "$host_appcore" -eq 1 ] ||
        die "the host link inputs must contain AppCore.o exactly once; found $host_appcore."
    [ "$test_appcore" -eq 0 ] ||
        die "PopsTests links AppCore.o $test_appcore time(s); AppCore must come only from the host."
    [ "$test_fakes" -eq 0 ] ||
        die "PopsTests still links AppCoreFakes.o instead of compiling its canonical sources."
}

metadata_verdict() {
    local host="$1" tests="$2"
    local host_descriptors test_descriptors
    host_descriptors="$(grep -Ec $'_[\x24]s7AppCore.*Mn$' <<<"$host" || true)"
    test_descriptors="$(grep -Ec $'_[\x24]s7AppCore.*Mn$' <<<"$tests" || true)"

    [ "$host_descriptors" -gt 0 ] ||
        die "the host defines no AppCore nominal type descriptors, so the runtime-copy check is vacuous."
    [ "$test_descriptors" -eq 0 ] ||
        die "PopsTests defines $test_descriptors AppCore nominal type descriptor(s); the hosted process would contain duplicate type identities."
}

single_match() {
    local description="$1"
    shift
    local matches
    matches="$(find "$@" -type f -print)"
    [ -n "$matches" ] || die "expected one $description, found none."
    [ "$(grep -c . <<<"$matches")" -eq 1 ] ||
        die "expected one $description, found: ${matches:-none}."
    printf '%s\n' "$matches"
}

cmd_project() {
    local project_file="${1-}" app_tests="${2-}"
    [ -f "$project_file" ] || die "'$project_file' is not a project specification."
    [ -d "$app_tests" ] || die "'$app_tests' is not the app test source directory."

    local imports
    imports="$(rg -l '^import AppCoreFakes$' "$app_tests" --glob '*.swift' | paste -sd, - || true)"
    project_verdict "$(target_block "$project_file")" "$imports"
    printf 'check-app-test-linkage: PopsTests compiles canonical fakes against import-only AppCore.\n'
}

cmd_built() {
    local derived_data="${1-}"
    [ -d "$derived_data" ] || die "'$derived_data' is not a derived-data directory."

    local intermediates="$derived_data/Build/Intermediates.noindex/Pops.build"
    local products="$derived_data/Build/Products"
    local host_list test_list host_binary test_binary host_symbols test_symbols
    host_list="$(single_match 'Pops link-file list' "$intermediates" -path '*/Pops.build/Objects-normal/*/Pops.LinkFileList')"
    test_list="$(single_match 'PopsTests link-file list' "$intermediates" -path '*/PopsTests.build/Objects-normal/*/PopsTests.LinkFileList')"
    link_verdict "$(<"$host_list")" "$(<"$test_list")"

    host_binary="$(find "$products" -type f -path '*/Pops.app/Pops.debug.dylib' -print -quit)"
    if [ -z "$host_binary" ]; then
        host_binary="$(find "$products" -type f -path '*/Pops.app/Pops' -print -quit)"
    fi
    test_binary="$(find "$products" -type f -path '*/Pops.app/PlugIns/PopsTests.xctest/PopsTests' -print -quit)"
    [ -n "$host_binary" ] || die "the built Pops executable was not found."
    [ -n "$test_binary" ] || die "the built PopsTests executable was not found."

    host_symbols="$(nm -U "$host_binary")"
    test_symbols="$(nm -U "$test_binary")"
    metadata_verdict "$host_symbols" "$test_symbols"

    printf 'check-app-test-linkage: AppCore nominal type metadata is defined only by the host.\n'
}

passes() { ("$@") >/dev/null 2>&1; }
rejects() { ! ("$@") >/dev/null 2>&1; }

cmd_self_test() {
    local correct missing_source linked_product linked_appcore imports host tests
    local host_symbols extension_symbols duplicate_symbols
    correct=$'  PopsTests:\n    sources:\n      - AppTests\n      - Packages/AppCore/Sources/AppCoreFakes\n    dependencies:\n      - target: Pops\n      - package: AppCore\n        link: false\n      - package: FeatureInventory\n        link: false'
    missing_source="${correct/      - Packages\/AppCore\/Sources\/AppCoreFakes$'\n'/}"
    linked_product="$correct"$'\n      - package: AppCore\n        product: AppCoreFakes'
    linked_appcore="${correct/        link: false/        link: true}"
    imports='AppSearchModelTests.swift'
    host='/Build/Products/Debug-iphonesimulator/AppCore.o'
    tests=$'/Build/Products/Debug-iphonesimulator/AppCoreFakes.o\n/Build/Products/Debug-iphonesimulator/AppCore.o'
    host_symbols=$'0000000000001000 S _\x24s7AppCore15RepositoryErrorOMn'
    extension_symbols=$'0000000000002000 T _\x24s7AppCore0A12DependenciesV9PopsTestsE4fakeACyFZ'
    duplicate_symbols=$'0000000000003000 S _\x24s7AppCore21UnboundInventoryStoreVMn'

    passes project_verdict "$correct" '' || die "the correct project fixture was rejected."
    rejects project_verdict "$missing_source" '' || die "a missing canonical source edge was accepted."
    rejects project_verdict "$linked_product" '' || die "a linked AppCoreFakes product was accepted."
    rejects project_verdict "$linked_appcore" '' || die "a linked AppCore dependency was accepted."
    rejects project_verdict "$correct" "$imports" || die "an AppCoreFakes import was accepted."
    passes link_verdict "$host" '' || die "the one-copy link fixture was rejected."
    rejects link_verdict "$host" "$tests" || die "duplicate AppCore link inputs were accepted."
    passes metadata_verdict "$host_symbols" "$extension_symbols" ||
        die "a test-owned AppCore extension was mistaken for duplicate type metadata."
    rejects metadata_verdict "$host_symbols" "$duplicate_symbols" ||
        die "duplicate AppCore nominal type metadata was accepted."
    rejects metadata_verdict '' "$extension_symbols" ||
        die "a vacuous host metadata fixture was accepted."

    printf 'check-app-test-linkage: graph, linker-input and type-identity regressions are rejected.\n'
}

case "${1-}" in
    project)
        shift
        cmd_project "$@"
        ;;
    built)
        shift
        cmd_built "$@"
        ;;
    self-test) cmd_self_test ;;
    *) die "expected 'project <project.yml> <AppTests>', 'built <derived-data>' or 'self-test'." ;;
esac
