import Foundation
import Testing

@testable import FeatureInventory

@Suite("Inventory form text row")
internal struct InventoryFormTextRowTests {
    private static let source: String = {
        let url = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/Form/InventoryItemFormRows.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    @Test("the text field keeps the beginning of an input visible")
    func textFieldUsesLeadingAlignment() {
        #expect(Self.source.contains(".multilineTextAlignment(.leading)"))
        #expect(!Self.source.contains(".multilineTextAlignment(.trailing)"))
    }
}
