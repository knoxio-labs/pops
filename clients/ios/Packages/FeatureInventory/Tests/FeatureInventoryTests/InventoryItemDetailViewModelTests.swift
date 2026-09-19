import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Item detail lifecycle and undo")
internal struct InventoryItemDetailViewModelTests {
    private typealias Fixture = InventoryFixture

    private static func store(
        lifecycle: InventoryLifecycle = .active, quantity: Int = 1,
        events: [InventoryEvent] = []
    ) -> RecordingInventoryStore {
        let tv = InventoryItem(
            id: "tv", revision: 1, seq: 1, name: "Television", typeKey: nil,
            quantity: InventoryQuantity(count: quantity), lifecycle: lifecycle,
            lifecycleChangedAt: lifecycle == .active ? nil : Fixture.epoch,
            placement: .location("living"), createdAt: Fixture.epoch, updatedAt: Fixture.epoch)
        return RecordingInventoryStore(
            InMemoryInventoryStore(
                items: [tv], locations: [Fixture.location("living", "Living room")]),
            history: events)
    }

    @Test("Discard with a reason issues the lifecycle command carrying that reason")
    func discardCarriesReason() async throws {
        let store = Self.store()
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }

        await model.perform(.discard(.donated))

        #expect(
            store.commands == [.setItemLifecycle(id: "tv", lifecycle: .discarded, reason: .donated)]
        )
        #expect(model.undoOffer?.message == "Discarded")
        #expect(await model.awaitDetail { $0.record.lifecycle == .discarded } != nil)
    }

    @Test("Discard with no reason sends no reason rather than a default one")
    func discardWithoutReason() async throws {
        let store = Self.store()
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }

        await model.perform(.discard(nil))

        #expect(store.commands == [.setItemLifecycle(id: "tv", lifecycle: .discarded, reason: nil)])
    }

    @Test("Undo reverses the receipt the discard returned, and the item counts again")
    func undoRevertsTheDiscard() async throws {
        let store = Self.store()
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }
        await model.perform(.discard(.broken))
        let offer = try #require(model.undoOffer)

        await model.undo(offer)
        await model.undo(offer)

        #expect(store.undone.count == 1)
        #expect(store.undone.first?.entityId == "tv")
        #expect(await model.awaitDetail { $0.record.lifecycle == .active } != nil)
        #expect(model.failure == nil)
    }

    @Test("History's Undo issues a revert of that event's seq")
    func historyUndoRevertsTheEvent() async throws {
        let store = Self.store(events: [Fixture.event(7, .moved, on: "tv")])
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, loaded) = await model.startAndAwaitDetail()
        defer { task.cancel() }
        let entry = try #require(loaded?.activity.first)

        await model.revert(entry)

        #expect(store.commands == [.revertEvent(seq: 7, entityKind: .item, entityId: "tv")])
    }

    @Test("an event that is no longer undoable sends nothing")
    func staleHistoryUndoIsInert() async throws {
        let store = Self.store(events: [Fixture.event(7, .moved, on: "tv", undoable: false)])
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, loaded) = await model.startAndAwaitDetail()
        defer { task.cancel() }

        await model.revert(try #require(loaded?.activity.first))

        #expect(store.commands.isEmpty)
    }

    @Test("a destroyed item offers no Restore, in the menu, the row, or the command")
    func destroyedHasNoRestore() async throws {
        let store = Self.store(lifecycle: .destroyed)
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, loaded) = await model.startAndAwaitDetail()
        defer { task.cancel() }
        let record = try #require(loaded?.record)

        await model.perform(.restore)

        #expect(
            InventoryLifecycleMenuEntry.entries(lifecycle: .destroyed, quantity: record.quantity)
                .isEmpty)
        #expect(InventoryItemDetailPrimaryAction.row(for: record).isEmpty)
        #expect(store.commands.isEmpty)
        #expect(model.undoOffer == nil)
    }

    @Test("a discarded item restores to active, with Undo")
    func discardedRestores() async throws {
        let store = Self.store(lifecycle: .discarded)
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, loaded) = await model.startAndAwaitDetail()
        defer { task.cancel() }
        let record = try #require(loaded?.record)

        #expect(InventoryItemDetailPrimaryAction.row(for: record).map(\.id) == ["restore"])
        await model.perform(.restore)

        #expect(store.commands == [.setItemLifecycle(id: "tv", lifecycle: .active, reason: nil)])
        #expect(model.undoOffer?.message == "Restored")
    }

    @Test("Destroy leaves no Undo and withdraws one already up")
    func destroyWithdrawsUndo() async throws {
        let store = Self.store()
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }
        await model.perform(.markLost)
        #expect(model.undoOffer != nil)
        _ = await model.awaitDetail { $0.record.lifecycle == .lost }

        await model.destroy()

        #expect(
            store.commands.last == .setItemLifecycle(id: "tv", lifecycle: .destroyed, reason: nil))
        #expect(model.undoOffer == nil)
    }

    @Test("Split sends the count with a fresh id, and refuses one that would empty either side")
    func splitBounds() async throws {
        let store = Self.store(quantity: 10)
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }

        await model.split(off: 10)
        await model.split(off: 0)
        await model.split(off: 3)

        #expect(store.commands.count == 1)
        guard case .splitItem(let id, let newItemId, let quantity) = store.commands.first else {
            Issue.record("expected a split, got \(store.commands)")
            return
        }
        #expect(id == "tv" && quantity == 3 && newItemId != "tv" && !newItemId.isEmpty)
    }

    @Test("Change quantity sends nothing for the same count or one out of range")
    func changeQuantityBounds() async throws {
        let store = Self.store(quantity: 4)
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }

        await model.changeQuantity(to: 4)
        await model.changeQuantity(to: 0)
        await model.changeQuantity(to: InventoryChangeQuantitySheet.ceiling + 1)
        await model.changeQuantity(to: 6)

        #expect(store.commands == [.setItemQuantity(id: "tv", quantity: 6)])
    }

    @Test("an item that is not in the replica reads as missing, not as a skeleton")
    func missingItem() async {
        let model = InventoryItemDetailViewModel(itemId: "nope", store: Self.store())
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }

        #expect(model.phase == .missing)
    }

    @Test("a refused write is reported")
    func refusedWriteIsReported() async {
        let model = InventoryItemDetailViewModel(itemId: "tv", store: Self.store(lifecycle: .lost))
        let (task, _) = await model.startAndAwaitDetail()
        defer { task.cancel() }

        await model.revert(
            InventoryActivityEntry(
                seq: 1, verb: "Moved", subject: "", detail: "", when: "", kind: .move,
                symbol: .move, month: "", from: nil, to: nil, reason: nil, device: nil,
                isUndoable: true))

        #expect(model.failure == .repository(.contractMismatch))
    }
}
