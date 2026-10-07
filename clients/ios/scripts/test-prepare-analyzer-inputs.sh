#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
ios_root="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$ios_root/../.." && pwd)"
scratch="$repo_root/tmp"
mkdir -p "$scratch"
work="$(mktemp -d "$scratch/ios-analyzer-inputs-test.XXXXXX")"
trap 'rm -rf "$work"' EXIT

physical_root="$work/physical checkout with spaces"
alias_root="$work/symlink checkout with spaces"
mkdir -p "$physical_root/clients/ios/App" "$work/input lists" "$work/artifacts"
ln -s "$physical_root" "$alias_root"
source_path="$alias_root/clients/ios/App/Example Source.swift"
touch "$physical_root/clients/ios/App/Example Source.swift"
canonical_source="$physical_root/clients/ios/App/Canonical Source.swift"
touch "$canonical_source"
filelist="$work/input lists/Example.SwiftFileList"
compiler_log="$work/compiler.log"
normalized_log="$work/artifacts/compiler.normalized.log"
filelist_directory="$work/artifacts/swift-filelists"
printf '%s\n%s\n' "$source_path" "$canonical_source" > "$filelist"
printf 'swiftc -module-name Example @"%s"\n' "$filelist" > "$compiler_log"

original_log="$(shasum -a 256 "$compiler_log")"
original_filelist="$(shasum -a 256 "$filelist")"
(
  cd "$alias_root/clients/ios"
  python3 "$script_dir/prepare-analyzer-inputs.py" \
    "$compiler_log" "$normalized_log" "$filelist_directory" "$PWD"
)

copied_filelist="$(find "$filelist_directory" -type f -name '*.SwiftFileList' -print -quit)"
if [ -z "$copied_filelist" ]; then
  printf 'prepare-analyzer-inputs: did not copy the referenced SwiftFileList.\n' >&2
  exit 1
fi
expected_source="$physical_root/clients/ios/App/Example Source.swift"
actual_line_count="$(wc -l < "$copied_filelist" | tr -d '[:space:]')"
first_source="$(sed -n '1p' "$copied_filelist")"
second_source="$(sed -n '2p' "$copied_filelist")"
if [ "$actual_line_count" -ne 2 ] \
  || [ "$first_source" != "$expected_source" ] \
  || [ "$second_source" != "$canonical_source" ]; then
  printf 'prepare-analyzer-inputs: copied source path was not canonicalized.\n' >&2
  exit 1
fi
if ! grep -qF "@$copied_filelist" "$normalized_log"; then
  printf 'prepare-analyzer-inputs: copied compiler log does not reference its copied SwiftFileList.\n' >&2
  exit 1
fi
if [ "$(shasum -a 256 "$compiler_log")" != "$original_log" ]; then
  printf 'prepare-analyzer-inputs: original compiler log changed.\n' >&2
  exit 1
fi
if [ "$(shasum -a 256 "$filelist")" != "$original_filelist" ]; then
  printf 'prepare-analyzer-inputs: original SwiftFileList changed.\n' >&2
  exit 1
fi

printf 'prepare-analyzer-inputs: symlink and spaced-path normalization holds.\n'
