import AppCoreFakes
import Testing

@testable import AppCore

/// `syncNow()`'s branch between `download()` and `refresh()`, and the two
/// stores whose `hasNeverDownloaded()` answers without a real replica:
/// `InMemoryInventoryStore` for the fakes every feature test uses, and
/// `UnboundInventoryStore` for the pairing screen. `LocalFirstInventoryStore`
/// and `OnlineInventoryStore`'s own answers are `InventoryReplicaTests`'.
@Suite("InventoryStore.syncNow")
internal struct InventorySyncNowTests {
    @Test("a store that has never downloaded is downloaded, not merely refreshed")
    func downloadsWhenNeverDownloaded() async {
        let store = CountingGatedInventoryStore(empty: true)

        await store.syncNow()

        #expect(store.downloadCount == 1)
        #expect(store.refreshCount == 0)
    }

    @Test("a store that has already downloaded is refreshed, not downloaded again")
    func refreshesWhenAlreadyDownloaded() async {
        let store = CountingGatedInventoryStore(empty: false)

        await store.syncNow()

        #expect(store.refreshCount == 1)
        #expect(store.downloadCount == 0)
    }

    @Test("hasNeverDownloaded is true only for an empty replica")
    func hasNeverDownloadedTracksEmpty() async {
        let store = InMemoryInventoryStore()
        store.setReplicaStatus(.empty)

        #expect(await store.hasNeverDownloaded())

        store.setReplicaStatus(.current)
        #expect(!(await store.hasNeverDownloaded()))

        store.setReplicaStatus(.stale(lastRefreshAt: nil))
        #expect(!(await store.hasNeverDownloaded()))
    }

    @Test("an unbound store answers hasNeverDownloaded false, so syncNow only refreshes (a no-op)")
    func unboundStoreDoesNotThrow() async {
        let store = UnboundInventoryStore()

        #expect(!(await store.hasNeverDownloaded()))
        await store.syncNow()
    }
}
