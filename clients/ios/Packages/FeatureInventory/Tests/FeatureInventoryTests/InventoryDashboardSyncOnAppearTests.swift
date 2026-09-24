import AppCore
import Foundation
import Testing

@testable import FeatureInventory

/// Opening the Inventory dashboard asks the store to sync itself
/// (POPS-4354), coalesced through `CoalescedInventorySync` so switching tabs
/// back and forth does not ask it over and over.
@MainActor
@Suite("Inventory dashboard sync on appear")
internal struct InventoryDashboardSyncOnAppearTests {
    @Test("opening the dashboard syncs the store")
    func syncsOnAppear() async {
        let store = CountingGatedInventoryStore()
        let model = InventoryDashboardViewModel(store: store)

        await model.syncOnAppear()

        #expect(store.refreshCount == 1)
    }

    @Test("a store that has never downloaded is downloaded, not merely refreshed")
    func downloadsWhenNeverDownloaded() async {
        let store = CountingGatedInventoryStore(empty: true)
        let model = InventoryDashboardViewModel(store: store)

        await model.syncOnAppear()

        #expect(store.downloadCount == 1)
        #expect(store.refreshCount == 0)
    }

    @Test("reappearing within the freshness window does not sync again")
    func rapidReappearDoesNotStack() async {
        let store = CountingGatedInventoryStore()
        let clock = TestClock(Date(timeIntervalSinceReferenceDate: 0))
        let model = InventoryDashboardViewModel(store: store, now: { clock.now })

        await model.syncOnAppear()
        clock.advance(by: 1)
        await model.syncOnAppear()

        #expect(store.refreshCount == 1)
    }

    @Test("appearing again after the freshness window syncs again")
    func reappearAfterFreshnessSyncsAgain() async {
        let store = CountingGatedInventoryStore()
        let clock = TestClock(Date(timeIntervalSinceReferenceDate: 0))
        let model = InventoryDashboardViewModel(store: store, now: { clock.now })

        await model.syncOnAppear()
        clock.advance(by: 31)
        await model.syncOnAppear()

        #expect(store.refreshCount == 2)
    }

    @Test("a sync already in flight is joined rather than started a second time")
    func joinsInFlightSync() async {
        let store = CountingGatedInventoryStore()
        store.holdNextCall()
        let model = InventoryDashboardViewModel(store: store)
        var entered = store.entered.makeAsyncIterator()

        async let first: Void = model.syncOnAppear()
        await entered.next()
        async let second: Void = model.syncOnAppear()
        store.release()
        _ = await (first, second)

        #expect(store.refreshCount == 1)
    }
}
