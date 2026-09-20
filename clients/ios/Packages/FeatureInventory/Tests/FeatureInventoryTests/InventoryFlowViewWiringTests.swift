import Foundation
import Testing

/// POPS-4176: entering Inventory with no room to open its replica must
/// announce Storage full itself, rather than waiting for a write nobody has
/// made yet. There is no observable model this modifier's presence changes
/// that a unit test could drive without mounting the whole tab, so this
/// reads the file directly, the same technique the other `*WiringTests`
/// suites in this package use for their own view-only wiring.
@Suite("InventoryFlowView wiring")
internal struct InventoryFlowViewWiringTests {
    private static let source: String = {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/InventoryFlowView.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    @Test("the scan is reading InventoryFlowView's actual source")
    func scanIsWiredUp() {
        #expect(!Self.source.isEmpty, "InventoryFlowView.swift is empty or missing")
    }

    @Test("entering Inventory announces Storage full when the replica never opened")
    func announcesStorageFullOnEntry() {
        #expect(
            Self.source.contains(".inventoryAnnouncesStorageFullOnEntry()"),
            "InventoryFlowView no longer announces Storage full on entry"
        )
    }

    /// POPS-4209: Scan is the dashboard's call to action and wears Inventory's
    /// amber, which only the token carries — a literal here would pass this
    /// and redden `DesignSystem`'s token discipline instead.
    @Test("Scan wears Inventory's amber")
    func scanIsAmber() {
        #expect(
            Self.source.contains(".foregroundStyle(Color.popsInventory)"),
            "the Scan control no longer takes Color.popsInventory"
        )
        #expect(
            !Self.source.contains(".foregroundStyle(Color.popsForeground)"),
            "a control in InventoryFlowView is back on popsForeground where amber was asked for"
        )
    }
}
