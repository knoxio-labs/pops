import AppCore
import Foundation
import Testing

@MainActor
@Suite("Coalesced inventory sync")
internal struct CoalescedInventorySyncTests {
    @Test("a sync asks the store to sync itself once")
    func syncsOnce() async {
        let store = CountingGatedInventoryStore()
        let sync = CoalescedInventorySync(store: store)

        await sync.run()

        #expect(store.refreshCount == 1)
        #expect(store.downloadCount == 0)
    }

    @Test("an empty store is downloaded, not merely refreshed")
    func downloadsWhenEmpty() async {
        let store = CountingGatedInventoryStore(empty: true)
        let sync = CoalescedInventorySync(store: store)

        await sync.run()

        #expect(store.downloadCount == 1)
        #expect(store.refreshCount == 0)
    }

    @Test("a call while one is running joins it rather than starting a second")
    func joinsInFlight() async {
        let store = CountingGatedInventoryStore()
        store.holdNextCall()
        let sync = CoalescedInventorySync(store: store)
        var entered = store.entered.makeAsyncIterator()

        async let first: Void = sync.run()
        await entered.next()
        async let second: Void = sync.run()
        store.release()
        _ = await (first, second)

        #expect(store.refreshCount == 1)
    }

    @Test("a call within the freshness window of the last one finishing does nothing")
    func skipsWithinFreshness() async {
        let store = CountingGatedInventoryStore()
        let clock = TestClock(Date(timeIntervalSinceReferenceDate: 0))
        let sync = CoalescedInventorySync(store: store, freshness: 30, now: { clock.now })

        await sync.run()
        clock.advance(by: 10)
        await sync.run()

        #expect(store.refreshCount == 1)
    }

    @Test("a call after the freshness window has elapsed syncs again")
    func runsAgainAfterFreshness() async {
        let store = CountingGatedInventoryStore()
        let clock = TestClock(Date(timeIntervalSinceReferenceDate: 0))
        let sync = CoalescedInventorySync(store: store, freshness: 30, now: { clock.now })

        await sync.run()
        clock.advance(by: 31)
        await sync.run()

        #expect(store.refreshCount == 2)
    }
}
