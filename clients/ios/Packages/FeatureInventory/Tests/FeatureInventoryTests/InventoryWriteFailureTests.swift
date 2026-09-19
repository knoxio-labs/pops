import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

/// A store whose writes and undos all fail with one error, for asserting what
/// a runner records and what the alert then says.
private struct RefusingInventoryStore: InventoryStore {
    let inner = InMemoryInventoryStore(
        items: [InventoryFixture.item("tv", "Television", at: .location("living"))],
        locations: [InventoryFixture.location("living", "Living room")])
    let error: any Error & Sendable

    func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        inner.observe(query)
    }
    func perform(_ command: InventoryCommand) async throws -> InventoryReceipt { throw error }
    func undo(_ receipt: InventoryReceipt) async throws { throw error }
    func resolve(_ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice) async throws {}
    func download() async throws {}
    func refresh() async {}
    func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        throw RepositoryError.unavailable
    }

    func uploadPhoto(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) async throws -> InventoryMediaUploadResult {
        throw RepositoryError.unavailable
    }
    func discardPhoto(_ sha256: String) async throws {}
    func status() -> AsyncStream<InventoryReplicaStatus> { inner.status() }
}

@MainActor
@Suite("Inventory write failures")
internal struct InventoryWriteFailureTests {
    private static let conflict = InventoryCommandError.fieldConflict(
        field: "placement", mine: "Kitchen", theirs: "Garage",
        source: .otherDevice(label: "Joao's iPad"), at: InventoryFixture.epoch, currentRevision: 4)

    @Test("the command runner keeps a conflict as a conflict, naming who won")
    func runnerKeepsTheConflict() async throws {
        let runner = InventoryCommandRunner(store: RefusingInventoryStore(error: Self.conflict))

        let landed = await runner.perform([.setItemFull(id: "tv", isFull: true)])

        #expect(landed == nil)
        let failure = try #require(runner.failure)
        #expect(failure == .command(Self.conflict))
        #expect(
            InventoryCopy.message(for: failure)
                == "Placement was changed on Joao's iPad first, so nothing changed here.")
    }

    @Test("a write the phone has no room for says so, rather than blaming the network")
    func storageFullSaysSo() async throws {
        let runner = InventoryCommandRunner(
            store: RefusingInventoryStore(error: InventoryStorageError.full))

        _ = await runner.perform([.setItemFull(id: "tv", isFull: true)])

        let failure = try #require(runner.failure)
        #expect(failure == .storageFull)
        #expect(
            InventoryCopy.message(for: failure)
                == "This phone is nearly out of storage, so that change was not saved.")
    }

    @Test("an Undo the server refuses says why, rather than blaming the network")
    func refusedUndoSaysWhy() async throws {
        let refusal = InventoryCommandError.rejected(
            reason: .illegalTransition, message: "cannot revert a destroy")
        let runner = InventoryCommandRunner(store: RefusingInventoryStore(error: refusal))
        let receipt = InventoryReceipt(mutationId: "m-1", entityKind: .item, entityId: "tv")
        runner.offer([receipt], message: "Marked full", symbol: .restore)
        let offer = try #require(runner.undoOffer)

        await runner.undo(offer)

        let failure = try #require(runner.failure)
        #expect(failure == .command(refusal))
        let message = InventoryCopy.message(for: failure)
        #expect(message == "It cannot go from where it is now to that, so nothing changed.")
        #expect(!message.contains("cannot revert a destroy"))
    }

    @Test("a taken code names who holds it and the free one")
    func codeCollision() {
        let failure = InventoryWriteFailure.command(
            .codeCollision(heldById: "k9", heldByName: "Kitchen 09", suggestedCode: "B413"))

        #expect(
            InventoryCopy.message(for: failure)
                == "That code is already on Kitchen 09. B413 is free.")
    }

    @Test("a deletion on the web and an unknown actor both read as a place, never blank")
    func deletedElsewhere() {
        let onWeb = InventoryWriteFailure.command(
            .deletedElsewhere(source: .web, at: InventoryFixture.epoch))
        let unknown = InventoryWriteFailure.command(
            .deletedElsewhere(
                source: .unrecognised(kind: "robot", label: "Shelf scanner"),
                at: InventoryFixture.epoch))

        #expect(
            InventoryCopy.message(for: onWeb)
                == "This was deleted on the server, so nothing changed.")
        #expect(
            InventoryCopy.message(for: unknown)
                == "This was deleted on Shelf scanner, so nothing changed.")
    }

    @Test("every rejection reason gets its own sentence, and an unknown one the generic")
    func rejectionReasons() {
        let reasons: [InventoryRejectedReason] = [
            .cycle, .targetMissing, .notContainer, .hasContents, .illegalTransition, .typeUnknown,
            .mediaMissing, .invalid,
        ]
        let messages = reasons.map {
            InventoryCopy.message(for: .command(.rejected(reason: $0, message: "x")))
        }

        #expect(Set(messages).count == reasons.count)
        #expect(
            InventoryCopy.message(
                for: .command(.rejected(reason: .unrecognised("new"), message: "x")))
                == InventoryCopy.message(for: .command(.rejected(reason: .invalid, message: "x"))))
    }

    @Test("a transport error still reads as the offline sentence")
    func transportStaysOffline() {
        #expect(
            InventoryWriteFailure.reporting(RepositoryError.transport("timed out"))
                == .repository(.transport("timed out")))
        #expect(
            InventoryCopy.message(for: .repository(.unavailable))
                == InventoryCopy.message(for: .repository(.transport("x"))))
    }

    @Test("cancellation is not a failure anybody is told about")
    func cancellationIsSilent() {
        #expect(InventoryWriteFailure.reporting(CancellationError()) == nil)
    }
}
