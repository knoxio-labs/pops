import AppCore
import Testing

@testable import FeatureInventory

@Suite("Inventory sync interruptions")
internal struct InventorySyncInterruptionsTests {
    @Test("session expired and app too old are the only two that block")
    func onlyTwoReasonsBlock() {
        #expect(
            InventorySyncInterruptionsModifier.reason(for: .blocked(reason: .sessionExpired))
                == .sessionExpired)
        #expect(
            InventorySyncInterruptionsModifier.reason(for: .blocked(reason: .appTooOld))
                == .appTooOld)
    }

    @Test(
        "every other replica status carries no blocking reason",
        arguments: [
            InventoryReplicaStatus.empty,
            .downloading(progress: 0.5),
            .current,
            .refreshing,
            .offline(lastRefreshAt: nil),
            .stale(lastRefreshAt: nil),
        ])
    func nonBlockedStatusesCarryNoReason(_ status: InventoryReplicaStatus) {
        #expect(InventorySyncInterruptionsModifier.reason(for: status) == nil)
    }
}
