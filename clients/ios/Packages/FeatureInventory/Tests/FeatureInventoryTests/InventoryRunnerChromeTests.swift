import AppCore
import Testing

@testable import FeatureInventory

/// POPS-4192: a storage-full write must never surface through the shared
/// chrome's generic one-line alert — it gets the approved dedicated alert
/// instead, the same one the Sync page shows. These two pure functions are
/// the whole of that routing decision, so they are what a regression here
/// would actually change.
@Suite("Inventory runner chrome failure routing")
internal struct InventoryRunnerChromeTests {
    @Test("a storage-full failure is excluded from the generic alert")
    func storageFullExcludedFromGenericAlert() {
        #expect(InventoryRunnerChrome.genericFailure(.storageFull) == nil)
    }

    @Test("every other failure still reaches the generic alert")
    func otherFailuresReachGenericAlert() {
        let repository = InventoryWriteFailure.repository(.transport("timed out"))
        #expect(InventoryRunnerChrome.genericFailure(repository) == repository)
    }

    @Test("nothing to show maps to nothing on both alerts")
    func nilFailureMapsToNilOnBoth() {
        #expect(InventoryRunnerChrome.genericFailure(nil) == nil)
        #expect(InventoryRunnerChrome.storageFullFailure(nil) == nil)
    }

    @Test("only a storage-full failure reaches the dedicated alert")
    func onlyStorageFullReachesTheDedicatedAlert() {
        let repository = InventoryWriteFailure.repository(.transport("timed out"))
        #expect(InventoryRunnerChrome.storageFullFailure(.storageFull) == .storageFull)
        #expect(InventoryRunnerChrome.storageFullFailure(repository) == nil)
    }
}
