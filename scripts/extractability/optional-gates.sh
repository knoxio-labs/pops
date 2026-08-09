#!/usr/bin/env bash
#
# ISO-CMD helper — run the isolation guards that ship as separate scripts.
#
# `isolation:check` bundles the rest (lint:boundaries + EX-3 + EX-1) directly.
# These two used to be run "if present", from a time when the exports gate had
# not landed yet. Both have landed, so the existence test now protects only the
# outcome nobody wants: rename or move either script and the gate silently drops
# out of the aggregate, which stays green and prints a friendly explanation. A
# missing gate is therefore a failure — see
# docs/architecture/adr-045-guards-must-prove-they-report.md.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

# lib-never-imports-a-pillar — complementary to dep-cruiser ISO-R1 (already run
# by lint:boundaries), kept here so the single local gate matches CI.
# exports-map self-consistency (ISO-EXPORTS).
required_gates=(
  scripts/ci/check-lib-no-pillar-import.mjs
  scripts/check-exports.mjs
)

missing=()
for gate in "${required_gates[@]}"; do
  [[ -f "$gate" ]] || missing+=("$gate")
done

if ((${#missing[@]} > 0)); then
  echo "isolation:check: FAIL — companion gate(s) not found:" >&2
  for gate in "${missing[@]}"; do
    echo "  $gate" >&2
  done
  echo "Update required_gates in $0 to wherever they now live." >&2
  exit 1
fi

for gate in "${required_gates[@]}"; do
  echo "isolation:check: running $gate" >&2
  node "$gate"
done
