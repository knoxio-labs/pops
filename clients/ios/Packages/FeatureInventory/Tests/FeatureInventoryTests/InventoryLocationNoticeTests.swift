import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

@MainActor
@Suite("A place's queued-move and conflict notices")
internal struct InventoryLocationNoticeTests {
    private typealias Fixture = InventoryFixture

    private static func location(_ id: String, _ name: String, parentId: String? = nil)
        -> InventoryLocation
    {
        InventoryLocation(
            id: id, revision: 1, seq: 1, name: name, parentId: parentId, sortOrder: 0)
    }

    private static func base() -> InMemoryInventoryStore {
        InMemoryInventoryStore(locations: [
            location("home", "Home"),
            location("shelf", "Shelf", parentId: "home"),
            location("garage", "Garage", parentId: "home"),
            location("attic", "Attic", parentId: "home"),
        ])
    }

    private static func queuedMove(_ id: String, to parentId: String?, mutation: String)
        -> InventoryQueuedMutation
    {
        InventoryQueuedMutation(
            receipt: InventoryReceipt(mutationId: mutation, entityKind: .location, entityId: id),
            command: .moveLocation(id: id, parentId: parentId), enqueuedAt: Fixture.epoch)
    }

    private static func moveConflict(
        on id: String, kind: InventoryRepairKind = .conflict, field: String? = "parentId",
        entityKind: InventoryEntityKind = .location
    ) -> InventoryRepair {
        InventoryRepair(
            id: "m-\(id)", entityKind: entityKind, entityId: id, kind: kind, field: field,
            options: [
                InventoryRepairOption(value: "garage", source: .thisDevice, at: Fixture.epoch),
                InventoryRepairOption(
                    value: "attic", source: .otherDevice(label: "iPad"), at: Fixture.epoch),
            ], openedAt: Fixture.epoch)
    }

    private static func notice(_ store: InMemoryInventoryStore, for id: String) async
        -> InventoryLocationNotice?
    {
        var iterator = store.observe(InventoryLocationNotice.query(id: id)).makeAsyncIterator()
        return await iterator.next().flatMap { $0 }
    }

    @Test("A place with nothing pending shows no notice")
    func nothingPending() async {
        #expect(await Self.notice(Self.base(), for: "shelf") == nil)
    }

    @Test("A queued move names where the place is going, by name, latest move first")
    func queuedMoveNamesDestination() async {
        let store = Self.base()
        store.addWaitingMutation(Self.queuedMove("shelf", to: "garage", mutation: "a"))
        store.addWaitingMutation(Self.queuedMove("shelf", to: "attic", mutation: "b"))
        store.addWaitingMutation(Self.queuedMove("garage", to: nil, mutation: "c"))

        #expect(await Self.notice(store, for: "shelf") == .queuedMove(to: "Attic"))
        #expect(await Self.notice(store, for: "garage") == .queuedMove(to: "the top level"))
        #expect(await Self.notice(store, for: "attic") == nil)
    }

    @Test("A move conflict names both sides and the other device, and beats the queued move")
    func conflictWinsOverQueue() async {
        let store = Self.base()
        store.addWaitingMutation(Self.queuedMove("shelf", to: "garage", mutation: "a"))
        store.addRepair(Self.moveConflict(on: "shelf"))

        #expect(
            await Self.notice(store, for: "shelf")
                == .conflictingMove(
                    repairId: "m-shelf", mine: "Garage", theirs: "Attic", device: "iPad"))
    }

    @Test("Only a move conflict on this place is a move conflict")
    func otherRepairsAreNotMoveConflicts() async {
        let store = Self.base()
        store.addRepair(Self.moveConflict(on: "shelf", field: "name"))
        store.addRepair(Self.moveConflict(on: "garage", kind: .deletedElsewhere))
        store.addRepair(Self.moveConflict(on: "attic", entityKind: .item))

        #expect(await Self.notice(store, for: "shelf") == nil)
        #expect(await Self.notice(store, for: "garage") == nil)
        #expect(await Self.notice(store, for: "attic") == nil)
    }

    @Test("Keep mine and Keep theirs settle the repair through the runner with their choice")
    func resolvesThroughTheRunner() async throws {
        for keepingMine in [true, false] {
            let base = Self.base()
            base.addRepair(Self.moveConflict(on: "shelf"))
            let store = RecordingInventoryStore(base)
            let model = InventoryLocationPageModel(id: "shelf", store: store)
            let task = Task { await model.observe() }
            defer { task.cancel() }
            await awaitObservedCondition { model.shownNotice != nil }

            await model.resolveMove(keepingMine: keepingMine)

            #expect(store.resolutions == [keepingMine ? .keepMine() : .discardMine])
            await awaitObservedCondition { model.shownNotice == nil }
            #expect(model.shownNotice == nil)
            #expect(model.runner.failure == nil)
        }
    }

    @Test("A resolution the store refuses is reported, and the notice stays")
    func refusedResolutionIsReported() async throws {
        let base = Self.base()
        base.addRepair(Self.moveConflict(on: "shelf"))
        let model = InventoryLocationPageModel(id: "shelf", store: RefusingResolveStore(base))
        let task = Task { await model.observe() }
        defer { task.cancel() }
        await awaitObservedCondition { model.shownNotice != nil }

        await model.resolveMove(keepingMine: true)

        #expect(model.runner.failure == .repository(.unavailable))
        #expect(model.shownNotice != nil)
    }

    @Test("With no conflict up, resolving does nothing")
    func resolvingWithoutConflictIsANoOp() async throws {
        let base = Self.base()
        base.addWaitingMutation(Self.queuedMove("shelf", to: "garage", mutation: "a"))
        let store = RecordingInventoryStore(base)
        let model = InventoryLocationPageModel(id: "shelf", store: store)
        let task = Task { await model.observe() }
        defer { task.cancel() }
        await awaitObservedCondition { model.shownNotice != nil }

        await model.resolveMove(keepingMine: true)

        #expect(store.resolutions.isEmpty)
    }
}

/// Forwards everything to an in-memory store except a repair's resolution,
/// which it refuses the way an unreachable server would.
private struct RefusingResolveStore: InventoryStore {
    let inner: InMemoryInventoryStore

    init(_ inner: InMemoryInventoryStore) { self.inner = inner }

    func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        inner.observe(query)
    }

    func perform(_ command: InventoryCommand) async throws -> InventoryReceipt {
        try await inner.perform(command)
    }

    func undo(_ receipt: InventoryReceipt) async throws { try await inner.undo(receipt) }

    func resolve(_ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice) async throws {
        throw RepositoryError.unavailable
    }

    func download() async throws { try await inner.download() }

    func refresh() async { await inner.refresh() }

    func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        try await inner.photo(sha256, variant: variant)
    }

    func uploadPhoto(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) async throws -> InventoryMediaUploadResult {
        try await inner.uploadPhoto(sha256: sha256, data: data, contentType: contentType)
    }

    func status() -> AsyncStream<InventoryReplicaStatus> { inner.status() }
}
