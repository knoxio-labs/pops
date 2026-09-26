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

    private static func sourceSection(from start: String, until end: String) -> String {
        guard let startRange = source.range(of: start),
            let endRange = source.range(of: end, range: startRange.upperBound..<source.endIndex)
        else { return "" }
        return String(source[startRange.lowerBound..<endRange.lowerBound])
    }

    @Test("the text field keeps the beginning of an input visible")
    func textFieldUsesLeadingAlignment() {
        let textRow = Self.sourceSection(
            from: "internal struct InventoryFormTextRow", until: "extension InventoryFormTextRow")
        #expect(textRow.contains(".multilineTextAlignment(.leading)"))
        #expect(!textRow.contains(".multilineTextAlignment(.trailing)"))
    }

    @Test("the whole text row focuses its field")
    func textRowUsesFullFocusRegion() {
        let textRow = Self.sourceSection(
            from: "internal struct InventoryFormTextRow", until: "extension InventoryFormTextRow")
        #expect(textRow.contains("InventoryFormFocusableRow(focus: focus)"))
        #expect(Self.source.contains("InventoryFormFocusableRow"))
        #expect(Self.source.contains(".contentShape(.rect)"))
        #expect(Self.source.contains(".onTapGesture(perform: onTap)"))
    }
}
