#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
ios_root="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$ios_root/../.." && pwd)"
scratch="$repo_root/tmp"
mkdir -p "$scratch"
work="$(mktemp -d "$scratch/ios-analyzer-test.XXXXXX")"
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin" "$work/artifacts"
printf 'compiler log fixture\n' > "$work/compiler.log"

cat > "$work/bin/xcodebuild" <<'EOF'
#!/usr/bin/env bash
printf 'Xcode 27.0\nBuild version 27A5209h\n'
EOF

cat > "$work/bin/swiftlint" <<'EOF'
#!/usr/bin/env bash
printf 'Fixture/DeadImport.swift:1:1: error: Unused Import Violation\n'
printf 'Done analyzing! Found 1 violation, 1 serious in %s files.\n' "$POPS_IOS_ANALYZER_TEST_FILE_COUNT"
exit 1
EOF

chmod +x "$work/bin/xcodebuild" "$work/bin/swiftlint"
file_count="$(find "$ios_root/App" "$ios_root/AppTests" "$ios_root/Packages" \
  \( -name .build -o -name Generated \) -type d -prune \
  -o -type f -name '*.swift' -print \
  | sed -E '/Packages\/[^/]+\/Package\.swift$/d' \
  | wc -l | tr -d ' ')"

set +e
output="$(cd "$ios_root" && \
  PATH="$work/bin:$PATH" \
  POPS_IOS_COMPILER_LOG="$work/compiler.log" \
  POPS_IOS_ANALYZER_ARTIFACTS="$work/artifacts" \
  POPS_IOS_ANALYZER_TEST_FILE_COUNT="$file_count" \
  POPS_XCODE_VERSION="27.0" \
  POPS_XCODE_BUILD="27A266a" \
  bash scripts/analyzer-lane.sh 2>&1)"
status=$?
set -e

if [ "$status" -ne 1 ]; then
  printf 'analyzer-lane self-test: a reported analyzer violation returned %s instead of 1.\n' "$status" >&2
  exit 1
fi
for expected in \
  'local Xcode is 27.0 (build 27A5209h)' \
  'Local findings are advisory off-pin' \
  "CI's analyzer result on the pinned Xcode is authoritative" \
  'Unused Import Violation' \
  'Found 1 violation'; do
  if ! grep -qF "$expected" <<<"$output"; then
    printf 'analyzer-lane self-test: output omitted %s.\n' "$expected" >&2
    exit 1
  fi
done
