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

    @Test("the grounded row can replace its leading glyph with a photo mark")
    func leadingMarkSupportsPhotos() {
        #expect(Self.source.contains("InventoryRecordMark("))
        #expect(Self.source.contains("if let photo, let loadPhoto"))
    }
}
