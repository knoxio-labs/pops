import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Inventory sync view model")
internal struct InventorySyncViewModelTests {
    private typealias Fixture = InventoryFixture

    @Test("the skeleton shows until the store answers for the first time")
    func skeletonBeforeFirstAnswer() async {
        let model = InventorySyncViewModel(store: PendingInventoryStore())
        let (task, page) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        #expect(model.phase == .loading)
        #expect(page == nil)
    }

    @Test("a store that ends without answering is unavailable, not an endless skeleton")
    func endedWithoutAnswerIsUnavailable() async {
        let model = InventorySyncViewModel(store: UnboundInventoryStore())
        let (task, _) = await model.startAndAwaitFirstAnswer()
        await task.value

        #expect(model.phase == .unavailable)
    }

    @Test("an empty replica offers Download, and Download brings it current")
    func emptyReplicaOffersDownload() async throws {
        let store = InMemoryInventoryStore()
        store.setReplicaStatus(.empty)
        let model = InventorySyncViewModel(store: store)
        let (task, loaded) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        #expect(try #require(loaded).status == .empty)

        await model.download()
        let after = await model.awaitPage { $0.status == .current }
        #expect(after?.status == .current)
    }

    @Test("a repair in the ledger becomes a row with its problem line and inline fix")
    func repairsBecomeRows() async throws {
        let store = InMemoryInventoryStore(
            items: [Fixture.item("box", "Moving box", at: .location("kitchen"))],
            locations: [Fixture.location("kitchen", "Kitchen")])
        store.addRepair(
            Fixture.repair(
                "m1", on: "box", kind: .conflict, field: "name",
                options: [
                    InventoryRepairOption(value: "Moving box", source: .thisDevice, at: .now),
                    InventoryRepairOption(
                        value: "Packing box", source: .otherDevice(label: "iPad"), at: .now),
                ]))
        let model = InventorySyncViewModel(store: store)
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        let page = await model.awaitPage { !$0.repairRows.isEmpty }
        let row = try #require(page?.repairRows.first)
        #expect(row.display.name == "Moving box")
        #expect(row.problem == "Name changed here and elsewhere.")
        #expect(row.repair.kind.fix.title == "Keep mine")
    }

    @Test("resolving inline removes the repair and offers Undo")
    func resolveInlineRemovesRepair() async throws {
        let store = InMemoryInventoryStore()
        let repair = Fixture.repair("m1", on: "box", kind: .deletedElsewhere)
        store.addRepair(repair)
        let model = InventorySyncViewModel(store: store)
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        _ = await model.awaitPage { !$0.repairRows.isEmpty }

        await model.resolveInline(repair)

        let after = await model.awaitPage { $0.repairRows.isEmpty }
        #expect(after?.repairRows.isEmpty == true)
        #expect(after?.resolvedRows.isEmpty == false)
        #expect(model.undoOffer?.message == "Restored")
    }

    @Test("inline Let go on a refused change sends the let-go choice and says Let go")
    func inlineLetGoOnUnrecognised() async throws {
        let inner = InMemoryInventoryStore()
        let repair = Fixture.repair("m1", on: "box", kind: .unrecognised("rejected"))
        inner.addRepair(repair)
        let store = RecordingInventoryStore(inner)
        let model = InventorySyncViewModel(store: store)
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        _ = await model.awaitPage { !$0.repairRows.isEmpty }

        await model.resolveInline(repair)

        #expect(store.resolutions == [.discardMine])
        let after = await model.awaitPage { !$0.resolvedRows.isEmpty }
        #expect(after?.resolvedRows.map(\.entry.outcome) == ["Let go"])
        #expect(model.undoOffer?.message == "Let go")
    }

    @Test("inline fix on every other repair keeps this phone's side")
    func inlineFixKeepsMine() {
        for kind: InventoryRepairKind in [
            .conflict, .codeCollision, .deletedElsewhere, .photoFailed,
        ] {
            #expect(InventorySyncViewModel.inlineChoice(for: kind) == .keepMine())
        }
    }

    @Test("the Undo capsule repeats the ledger's own line for the resolution")
    func capsuleReadsTheLedger() async throws {
        let inner = InMemoryInventoryStore()
        let repair = Fixture.repair("m1", on: "box", kind: .photoFailed)
        inner.addRepair(repair)
        let model = InventorySyncViewModel(store: inner)
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        _ = await model.awaitPage { !$0.repairRows.isEmpty }

        await model.resolveInline(repair)

        #expect(model.undoOffer?.message == "Photo retried")
    }

    @Test("a waiting mutation with no progress marks queued; sending marks synchronizing")
    func waitingRowProgressMarksState() async throws {
        let store = InMemoryInventoryStore(
            items: [Fixture.item("box", "Moving box", at: .location("kitchen"))],
            locations: [Fixture.location("kitchen", "Kitchen")])
        store.addWaitingMutation(
            Fixture.waitingMutation(
                "m1", on: "box",
                command: .setItemAccess(id: "box", access: .closed)))
        let model = InventorySyncViewModel(store: store)
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        let queued = await model.awaitPage { !$0.waitingRows.isEmpty }
        #expect(queued?.waitingRows.first?.progress == nil)
        #expect(queued?.waitingRows.first?.detail == "Close")

        store.setWaitingMutationProgress(mutationId: "m1", progress: 0.5)
        let sending = await model.awaitPage { $0.waitingRows.first?.progress != nil }
        #expect(sending?.waitingRows.first?.progress == 0.5)
        #expect(sending?.sending.count == 1)
    }

    @Test("a waiting delete reads as Delete")
    func waitingDeleteTitled() async throws {
        let store = InMemoryInventoryStore(
            items: [Fixture.item("box", "Moving box", at: .location("kitchen"))],
            locations: [Fixture.location("kitchen", "Kitchen")])
        store.addWaitingMutation(
            Fixture.waitingMutation("m1", on: "box", command: .deleteItem(id: "box")))
        let model = InventorySyncViewModel(store: store)
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        let queued = await model.awaitPage { !$0.waitingRows.isEmpty }
        #expect(queued?.waitingRows.first?.detail == "Delete")
    }

    @Test("a storage-full download failure raises the alert rather than the failure banner")
    func downloadStorageFullRaisesAlert() async {
        let store = InMemoryInventoryStore()
        store.setStorageFull()
        let model = InventorySyncViewModel(store: store)
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        await model.download()

        #expect(model.storageFull)
        #expect(model.failure == nil)
    }

    @Test("a refused write is reported, not swallowed")
    func writeFailureIsReported() async {
        let model = InventorySyncViewModel(store: FailingInventoryStore())
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        await model.download()

        #expect(model.failure == .unavailable)
    }
}
