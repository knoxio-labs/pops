# ADR-031: Release cadence by dependency tree

## Status

**Superseded** by [ADR-040](./adr-040-cross-pillar-contract-discipline.md) — 2026-09-26. Never implemented; it built on ADR-030's contract-package model, which did not survive.

## What it decided

Independent per-pillar deploys with semver-disciplined contracts: each pillar declares the contract version it implements, minor/patch releases ripple silently, major releases surface via a dependency-tree report, and a runtime SDK check flags version-skew calls.

## Why it no longer holds

None of it was built — no `"implements"` field, no dependency-tree report tool, no contract-version-skew check. It depended entirely on ADR-030's separately versioned contract packages, which were folded back into their pillars. Cross-pillar breaking changes are instead caught by ADR-040's regenerate-and-diff CI gates at build time, not by a runtime version-skew safety net.

Stubbed deliberately: the full options table and rationale are in git history.
