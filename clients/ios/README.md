# iOS client

A native SwiftUI iPhone app that reaches the federation over HTTP through the BFM pillar and is imported by nothing in this repo — the two halves of what [ADR-043](../../docs/architecture/adr-043-clients-as-a-unit-kind.md) means by a client.

The consequence worth internalising before changing anything here: this app is **distributed, not deployed**. It leaves through App Store Connect onto hardware the operator does not control, so a build already on a phone keeps calling yesterday's contract for as long as its owner declines to update. Every other consumer of a pillar contract in this repo redeploys with its producer; this one cannot.

The Xcode project, the SPM module layout and the commands to regenerate them land with the scaffold (POPS-1368) and replace this file. It exists ahead of them because the docs-model guard treats every directory under `clients/` as a published unit and requires the README a reader lands on.
