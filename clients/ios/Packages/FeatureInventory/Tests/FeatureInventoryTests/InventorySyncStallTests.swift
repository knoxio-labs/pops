import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

/// POPS-4493: the Sync header says sending is stuck, with what is waiting,
/// instead of looking idle; blocked still wins, and a cleared stall goes back
/// to the ordinary line.
@MainActor
@Suite("Inventory sync: sending stall")
internal struct InventorySyncStallTests {
    private typealias Fixture = InventoryFixture

    private static func store(waiting count: Int) -> InMemoryInventoryStore {
        let store = InMemoryInventoryStore(
            items: [Fixture.item("box", "Moving box", at: .location("kitchen"))],
            locations: [Fixture.location("kitchen", "Kitchen")])
        for index in 0..<count {
            store.addWaitingMutation(
                Fixture.waitingMutation(
                    "m\(index)", on: "box", command: .setItemAccess(id: "box", access: .closed)))
        }
        return store
    }

    private static let stall = InventorySendingStall(since: Date(timeIntervalSince1970: 0))

    @Test("a stall reads as stuck with the count waiting, not as synced")
    func stallReadsStuck() async throws {
        let store = Self.store(waiting: 2)
        store.setSendingStall(Self.stall)
        let model = InventorySyncViewModel(store: store)
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        let page = try #require(await model.awaitPage { $0.ledger.sendingStall != nil })
        let status = InventorySyncHeaderStatus.derive(page: page)
        #expect(status == .stuck(waiting: 2))
        #expect(InventorySyncView.statusLine(status) == "Can't send 2 changes")
    }

    @Test("one waiting change, and none, read in the singular and generically")
    func stuckLines() {
        #expect(InventorySyncView.statusLine(.stuck(waiting: 1)) == "Can't send 1 change")
        #expect(InventorySyncView.statusLine(.stuck(waiting: 0)) == "Changes can't be sent")
    }

    @Test("a stall is louder than offline")
    func stallBeatsOffline() async throws {
        let store = Self.store(waiting: 1)
        store.setReplicaStatus(.offline(lastRefreshAt: nil))
        store.setSendingStall(Self.stall)
        let model = InventorySyncViewModel(store: store)
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        let page = try #require(await model.awaitPage { $0.ledger.sendingStall != nil })
        #expect(InventorySyncHeaderStatus.derive(page: page) == .stuck(waiting: 1))
    }

    @Test("blocked still reads as blocked's offline line, whatever else is stuck")
    func blockedBeatsStall() async throws {
        let store = Self.store(waiting: 1)
        store.setReplicaStatus(.blocked(reason: .sessionExpired))
        store.setSendingStall(Self.stall)
        let model = InventorySyncViewModel(store: store)
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        let page = try #require(await model.awaitPage { $0.ledger.sendingStall != nil })
        #expect(InventorySyncHeaderStatus.derive(page: page) == .offline(lastRefreshAt: nil))
    }

    @Test("a cleared stall goes back to the ordinary line")
    func clearedStall() async throws {
        let store = Self.store(waiting: 1)
        store.setSendingStall(Self.stall)
        let model = InventorySyncViewModel(store: store)
        let (task, _) = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }
        _ = await model.awaitPage { $0.ledger.sendingStall != nil }

        store.setSendingStall(nil)

        let page = try #require(await model.awaitPage { $0.ledger.sendingStall == nil })
        #expect(InventorySyncHeaderStatus.derive(page: page) == .online(lastRefreshAt: nil))
    }
}
