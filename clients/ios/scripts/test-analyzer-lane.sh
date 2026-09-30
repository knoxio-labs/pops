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
printf 'Xcode 27.0\nBuild version %s\n' "$POPS_IOS_ANALYZER_TEST_XCODE_BUILD"
EOF

cat > "$work/bin/swiftlint" <<'EOF'
#!/usr/bin/env bash
if [ "$POPS_IOS_ANALYZER_TEST_FINDING" -eq 1 ]; then
  printf 'Fixture/DeadImport.swift:1:1: error: Unused Import Violation\n'
  printf 'Done analyzing! Found 1 violation, 1 serious in %s files.\n' "$POPS_IOS_ANALYZER_TEST_FILE_COUNT"
  exit 1
fi
printf 'Done analyzing! Found 0 violations, 0 serious in %s files.\n' "$POPS_IOS_ANALYZER_TEST_FILE_COUNT"
EOF

chmod +x "$work/bin/xcodebuild" "$work/bin/swiftlint"
file_count="$(cd "$ios_root" && find App AppTests Packages \
  \( -name .build -o -name Generated \) -type d -prune \
  -o -type f -name '*.swift' -print \
  | sed -E '/^Packages\/[^/]+\/Package\.swift$/d' \
  | wc -l | tr -d ' ')"

run_lane() {
  local xcode_build="$1" finding="$2"
  if output="$(cd "$ios_root" && \
    PATH="$work/bin:$PATH" \
    POPS_IOS_COMPILER_LOG="$work/compiler.log" \
    POPS_IOS_ANALYZER_ARTIFACTS="$work/artifacts" \
    POPS_IOS_ANALYZER_TEST_FILE_COUNT="$file_count" \
    POPS_IOS_ANALYZER_TEST_XCODE_BUILD="$xcode_build" \
    POPS_IOS_ANALYZER_TEST_FINDING="$finding" \
    POPS_XCODE_VERSION="27.0" \
    POPS_XCODE_BUILD="27A266a" \
    bash scripts/analyzer-lane.sh 2>&1)"; then
    lane_status=0
  else
    lane_status=$?
  fi
}

assert_contains() {
  local content="$1" expected="$2"
  if ! grep -qF "$expected" <<<"$content"; then
    printf 'analyzer-lane self-test: output omitted %s.\n' "$expected" >&2
    exit 1
  fi
}

assert_not_contains() {
  local content="$1" unexpected="$2"
  if grep -qF "$unexpected" <<<"$content"; then
    printf 'analyzer-lane self-test: output unexpectedly contained %s.\n' "$unexpected" >&2
    exit 1
  fi
}

run_lane 27A5209h 1
if [ "$lane_status" -ne 1 ]; then
  printf 'analyzer-lane self-test: off-pin finding returned %s instead of 1.\n' "$lane_status" >&2
  exit 1
fi
assert_contains "$output" 'local Xcode is 27.0 (build 27A5209h)'
assert_contains "$output" 'Local findings are advisory off-pin'
assert_contains "$output" "CI's analyzer result on the pinned Xcode is authoritative"
assert_contains "$output" 'Unused Import Violation'
assert_contains "$output" 'Found 1 violation'

run_lane 27A5209h 0
if [ "$lane_status" -ne 2 ]; then
  printf 'analyzer-lane self-test: clean off-pin run returned %s instead of 2.\n' "$lane_status" >&2
  exit 1
fi
assert_contains "$output" 'NOT A CLEAN RUN'
assert_contains "$output" 'Found 0 violations'
assert_not_contains "$output" 'Unused Import Violation'

run_lane 27A266a 1
if [ "$lane_status" -ne 1 ]; then
  printf 'analyzer-lane self-test: pinned finding returned %s instead of 1.\n' "$lane_status" >&2
  exit 1
fi
assert_contains "$output" 'Unused Import Violation'
assert_not_contains "$output" 'advisory'
assert_not_contains "$output" 'NOT A CLEAN RUN'

run_lane 27A266a 0
if [ "$lane_status" -ne 0 ]; then
  printf 'analyzer-lane self-test: clean pinned run returned %s instead of 0.\n' "$lane_status" >&2
  exit 1
fi
assert_contains "$output" 'Found 0 violations'
assert_not_contains "$output" 'advisory'
assert_not_contains "$output" 'NOT A CLEAN RUN'

printf 'analyzer-lane: pinned and off-pin outcomes hold.\n'
