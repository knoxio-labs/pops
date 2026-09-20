import AppCore
import Foundation
import Testing

@testable import FeatureInventory

@Suite("Inventory sync interruptions")
internal struct InventorySyncInterruptionsTests {
    /// POPS-4192: the button opens the app updates arrive through. This
    /// build has no App Store Connect id or TestFlight join link checked
    /// in, so the URL must be the scheme-only one that needs neither — a
    /// regression here (e.g. back to a placeholder host, or a scheme this
    /// device has no app registered for) would silently do nothing on tap.
    @Test("the update action opens TestFlight, not the App Store")
    func updateOpensTestFlight() {
        #expect(InventorySyncInterruptionCopy.updateURL.scheme == "itms-beta")
    }
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
