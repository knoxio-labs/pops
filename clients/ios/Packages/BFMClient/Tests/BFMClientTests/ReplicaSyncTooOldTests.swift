import AppCore
import Foundation
import InventoryReplica
import Testing

@testable import BFMClient

/// A server that moved past this build (POPS-4404): a page, or the pinned
/// catalogue it names, that this build cannot read is refused before
/// anything is applied, and the replica shows blocked as too old rather than
/// offline.
@Suite("Replica sync through the BFM transport: too old", .timeLimit(.minutes(1)))
internal struct ReplicaSyncTooOldTests {
    @Test(
        "a catalogue with a field kind this build does not know blocks as too old, applying nothing"
    )
    func unknownFieldKind() async throws {
        let harness = try ReplicaSyncHarness()
        try await harness.downloadLamp(revision: 2)
        await harness.server.set(
            "changes",
            .ok(
                Protocol2Wire.changes(
                    items: [Protocol2Wire.lamp(revision: 2, seq: 11, catalogueRevision: 3)],
                    catalogueRevision: 3, nextSince: 12)))
        let future = Protocol2Wire.field(
            id: Protocol2Wire.brightness, key: "glow", label: "Glow", kind: "holographic")
        await harness.server.set(
            "catalogue:3",
            .ok(
                Protocol2Wire.catalogue(
                    revision: 3, fields: Protocol2Wire.bulbFields + [future])))

        await harness.store.refresh()

        #expect(try harness.status == .blocked(reason: .appTooOld))
        #expect(try harness.lamp?.revision == 1)
        #expect(try harness.replica.syncPosition().since == 11)
        #expect(try harness.replica.catalogue(revision: 3) == nil)
    }

    @Test(
        "a page whose minimum protocol is above this build's blocks as too old before anything is fetched"
    )
    func pageMinimumProtocolAboveSupport() async throws {
        let harness = try ReplicaSyncHarness()
        try await harness.downloadLamp(revision: 2)
        await harness.server.set(
            "changes",
            .ok(
                Protocol2Wire.changes(
                    items: [Protocol2Wire.lamp(revision: 2, seq: 11, catalogueRevision: 3)],
                    catalogueRevision: 3, minimumProtocol: 3, nextSince: 12)))
        await harness.server.set("catalogue:3", .ok(Protocol2Wire.catalogue(revision: 3)))

        await harness.store.refresh()

        #expect(try harness.status == .blocked(reason: .appTooOld))
        #expect(await harness.server.count("catalogue:3") == 0)
        #expect(try harness.lamp?.revision == 1)
        #expect(try harness.replica.syncPosition().since == 11)
    }

    @Test("a pinned catalogue whose minimum protocol is above this build's blocks as too old")
    func catalogueMinimumProtocolAboveSupport() async throws {
        let harness = try ReplicaSyncHarness()
        try await harness.downloadLamp(revision: 2)
        await harness.server.set(
            "changes",
            .ok(
                Protocol2Wire.changes(
                    items: [Protocol2Wire.lamp(revision: 2, seq: 11, catalogueRevision: 3)],
                    catalogueRevision: 3, nextSince: 12)))
        await harness.server.set(
            "catalogue:3", .ok(Protocol2Wire.catalogue(revision: 3, minimumProtocol: 3)))

        await harness.store.refresh()

        #expect(try harness.status == .blocked(reason: .appTooOld))
        #expect(try harness.lamp?.revision == 1)
        #expect(try harness.replica.syncPosition().storedCatalogueRevision == 2)
        #expect(try harness.replica.catalogue(revision: 3) == nil)
    }
}
