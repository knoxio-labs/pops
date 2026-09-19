import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Locations browser offline line")
internal struct InventoryLocationBrowserOfflineTests {
    nonisolated private static let now = InventoryFixture.epoch.addingTimeInterval(86_400)

    private static func model(_ status: InventoryReplicaStatus) -> InventoryLocationBrowserModel {
        let store = InMemoryInventoryStore(
            locations: [InventoryFixture.location("home", "Home")])
        store.setReplicaStatus(status)
        return InventoryLocationBrowserModel(store: store, now: { now })
    }

    private static func observed(_ model: InventoryLocationBrowserModel) async -> Task<Void, Never>
    {
        let task = Task { await model.observe() }
        await awaitObservedCondition {
            model.offline.phase != .loading && model.tree.phase != .loading
        }
        return task
    }

    @Test("Offline says when the replica last refreshed, as the Items browser does")
    func offlineSaysWhen() async {
        let model = Self.model(.offline(lastRefreshAt: Self.now.addingTimeInterval(-7_200)))
        let task = await Self.observed(model)
        defer { task.cancel() }

        let expected = InventoryOfflineState(
            .offline(lastRefreshAt: Self.now.addingTimeInterval(-7_200)))?.line(now: Self.now)
        #expect(model.offlineLine == expected)
        #expect(model.offlineLine?.hasPrefix("Offline · updated ") == true)
    }

    @Test("A stale replica with no refresh on record says only Offline")
    func staleWithoutRefresh() async {
        let model = Self.model(.stale(lastRefreshAt: nil))
        let task = await Self.observed(model)
        defer { task.cancel() }

        #expect(model.offlineLine == "Offline")
    }

    @Test("A current replica shows no line, and neither does one still loading")
    func currentShowsNothing() async {
        let loading = InventoryLocationBrowserModel(store: PendingInventoryStore())
        #expect(loading.offlineLine == nil)

        let model = Self.model(.current)
        let task = await Self.observed(model)
        defer { task.cancel() }

        #expect(model.offlineLine == nil)
    }

    @Test("The line goes away once the replica catches up")
    func lineLeavesWhenBackOnline() async {
        let store = InMemoryInventoryStore(
            locations: [InventoryFixture.location("home", "Home")])
        store.setReplicaStatus(.offline(lastRefreshAt: nil))
        let model = InventoryLocationBrowserModel(store: store, now: { Self.now })
        let task = await Self.observed(model)
        defer { task.cancel() }
        #expect(model.offlineLine == "Offline")

        store.setReplicaStatus(.current)
        await awaitObservedCondition { model.offlineLine == nil }

        #expect(model.offlineLine == nil)
    }
}
