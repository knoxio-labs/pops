# US-08: CI publish pipeline for pops-mcp image

> PRD: [PRD-102 — MCP Server](README.md)
> Status: Done

## Goal

Publish `ghcr.io/knoxio/pops-mcp` on every push to `main`, matching the existing pops-api / pops-shell publish pattern.

## Acceptance Criteria

- [x] `publish-images.yml` builds + pushes `pops-mcp` with tags `main`, `sha-<short>`, and semver on `v*` tags
- [x] `docker-build.yml` validates that the pops-mcp Dockerfile builds cleanly on every PR
- [x] `com.centurylinklabs.watchtower.enable: true` label ensures Watchtower auto-rolls out new images
