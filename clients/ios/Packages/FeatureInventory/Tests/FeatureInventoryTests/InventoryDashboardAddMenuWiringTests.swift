import Foundation
import Testing

/// Proof that the dashboard's Add menu opens the real creation surfaces: the
/// shared item form for New item and New container, and the Locations
/// screens' New place sheet for New place.
///
/// There is nothing here to mount: `InventoryDashboardAddControl` reads
/// `\.inventoryItemForm` from the environment, and a unit-test process hosts
/// no SwiftUI environment for a view to read. So this reads the source
/// directly, the same way `InventoryItemsBrowserNewItemWiringTests` does, and
/// fails the moment an entry stops reaching for a shared presenter or a
/// fourth entry appears.
@Suite("Dashboard Add menu wiring")
internal struct InventoryDashboardAddMenuWiringTests {
    private static func source(_ path: String) -> [String] {
        let url = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: path)
        let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        return text.components(separatedBy: "\n")
    }

    private static let control = source(
        "Sources/FeatureInventory/Dashboard/InventoryDashboardAddControl.swift")
    private static let flow = source("Sources/FeatureInventory/InventoryFlowView.swift")
    private static let opensForm = "itemForm?(.create(placement: nil))"

    @Test("the scan is reading the real sources")
    func scanIsWiredUp() {
        #expect(Self.control.count > 1, "InventoryDashboardAddControl.swift is empty or missing")
        #expect(Self.flow.count > 1, "InventoryFlowView.swift is empty or missing")
    }

    @Test("the control reads the shared item-form presenter from the environment")
    func readsTheSharedPresenter() {
        #expect(
            Self.control.contains { $0.contains("@Environment(\\.inventoryItemForm)") },
            Comment(
                rawValue:
                    "InventoryDashboardAddControl no longer reads \\.inventoryItemForm — New "
                    + "item and New container have nothing to open the shared form with"))
    }

    @Test("the menu offers exactly New item, New container and New place")
    func offersTheThreeEntries() {
        let titles = ["New item", "New container", "New place"]
        for title in titles {
            #expect(
                Self.control.contains { $0.contains("Button(\"\(title)\"") },
                Comment(rawValue: "the menu no longer offers \(title)"))
        }
        let buttons = Self.control.filter { $0.contains("Button(\"") }
        #expect(
            buttons.count == titles.count,
            Comment(
                rawValue:
                    "expected exactly \(titles.count) menu entries; found \(buttons.count) — "
                    + "an entry the design does not name has been added or one has gone"))
    }

    @Test("New item and New container both open the real create form")
    func itemAndContainerOpenTheForm() {
        let occurrences = Self.control.filter { $0.contains(Self.opensForm) }
        #expect(
            occurrences.count == 2,
            Comment(
                rawValue:
                    "expected New item and New container to each call \(Self.opensForm) once; "
                    + "found \(occurrences.count) call(s)"))
    }

    @Test("New place opens the Locations screens' create sheet, not one of its own")
    func placeOpensTheSharedSheet() {
        #expect(
            Self.control.contains { $0.contains("inventoryLocationCreateSheet(") },
            Comment(
                rawValue:
                    "InventoryDashboardAddControl no longer installs "
                    + "inventoryLocationCreateSheet — New place has nothing to open"))
        #expect(
            !Self.control.contains { $0.contains("InventoryLocationCreateSheet(") },
            Comment(
                rawValue:
                    "the control constructs InventoryLocationCreateSheet itself — it should go "
                    + "through inventoryLocationCreateSheet, which loads the tree the sheet "
                    + "needs"))
    }

    @Test("the New place host opens the same sheet the Locations screens open")
    func theHostReusesTheLocationsSheet() {
        let host = Self.source(
            "Sources/FeatureInventory/Locations/InventoryLocationCreateSheetHost.swift")
        #expect(
            host.contains { $0.contains("InventoryLocationCreateSheet(tree:") },
            Comment(
                rawValue:
                    "InventoryLocationCreateSheetHost no longer presents "
                    + "InventoryLocationCreateSheet — New place has drifted from the sheet the "
                    + "Locations browser and a place's page open"))
    }

    @Test("the dashboard mounts the Add control beside Scan")
    func theFlowMountsTheControl() {
        #expect(
            Self.flow.contains { $0.contains("InventoryDashboardAddControl(") },
            Comment(rawValue: "InventoryFlowView no longer places the Add control"))
        #expect(
            Self.flow.contains { $0.contains("InventoryRoute.scan") },
            Comment(rawValue: "the Scan control has gone from InventoryFlowView"))
    }
}
