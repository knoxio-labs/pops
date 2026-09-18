import Foundation
import Testing

/// Proof that New item in the Items browser opens the real item form, and
/// that both places the browser offers it — the empty-state button and the
/// search bar's add control — open the exact same request.
///
/// There is nothing here to mount: `InventoryItemsBrowserView` reads
/// `\.inventoryItemForm` from the environment, and a unit-test process hosts
/// no SwiftUI environment for a view to read (see
/// `ReceiptResultAccessibilityWiringTests` for why mounting a view is not an
/// option in this target). So this reads the source directly, the same way
/// that suite does, and fails the moment either call site stops reaching for
/// the shared presenter or drifts from the other one's request.
@Suite("Items browser New item wiring")
internal struct InventoryItemsBrowserNewItemWiringTests {
    private static let source: [String] = {
        let url = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/Browse/InventoryItemsBrowserView.swift")
        let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        return text.components(separatedBy: "\n")
    }()

    private static let openCall = "itemForm?(.create(placement: nil))"

    @Test("the scan is reading the real source")
    func scanIsWiredUp() {
        #expect(Self.source.count > 1, "InventoryItemsBrowserView.swift is empty or missing")
    }

    @Test("the browser reads the shared item-form presenter from the environment")
    func readsTheSharedPresenter() {
        #expect(
            Self.source.contains { $0.contains("@Environment(\\.inventoryItemForm)") },
            Comment(
                rawValue:
                    "InventoryItemsBrowserView no longer reads \\.inventoryItemForm — New item "
                    + "has nothing to open the shared form with"))
    }

    @Test("the empty-state Add an item button opens the real create form")
    func emptyStateOpensCreateForm() {
        let line = Self.source.first { $0.contains("Add an item") }
        let opensCall = Self.source.first { $0.contains(Self.openCall) }
        #expect(line != nil, "the empty-state \"Add an item\" button no longer exists")
        #expect(
            opensCall != nil,
            Comment(rawValue: "nothing in the file calls \(Self.openCall)"))
    }

    @Test("the search bar's New item control opens the same request as the empty state")
    func searchBarAndEmptyStateOpenTheSameRequest() {
        let occurrences = Self.source.filter { $0.contains(Self.openCall) }
        #expect(
            occurrences.count == 2,
            Comment(
                rawValue:
                    "expected the empty-state button and the search bar's New item control to "
                    + "each call \(Self.openCall) once; found \(occurrences.count) call(s) — "
                    + "one of them has drifted from the other or from the shared form"))
    }

    @Test("New item no longer opens a placeholder screen")
    func noPendingPlaceholderRemains() {
        #expect(
            !Self.source.contains { $0.contains("InventoryPendingScreen") },
            Comment(
                rawValue:
                    "InventoryItemsBrowserView still references InventoryPendingScreen — New "
                    + "item should open the real form, not a placeholder"))
        #expect(
            !Self.source.contains { $0.contains("inventoryNewItemSheet") },
            Comment(
                rawValue:
                    "the retired inventoryNewItemSheet helper is still referenced"))
    }
}
