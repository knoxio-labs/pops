import Foundation
import Testing

@Suite("Inventory grounded row selection")
internal struct InventoryGroundedRowSelectionTests {
    private static let source: String = {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/Dashboard/InventoryGroundedComponents.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    @Test("the shared grounded leading mark enters selection mode")
    func leadingMarkUsesSelectionControl() {
        #expect(!Self.source.isEmpty, "the grounded row source is empty or missing")
        #expect(Self.source.contains("InventorySelectableMark {"))
    }
}
