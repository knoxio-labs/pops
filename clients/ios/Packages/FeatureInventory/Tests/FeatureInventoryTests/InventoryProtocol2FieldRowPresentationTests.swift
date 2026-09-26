import Foundation
import Testing

@testable import FeatureInventory

@Suite("Protocol-2 many-value field row presentation")
internal struct InventoryManyFieldRowTests {
    private static let source: String = {
        let url = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/Form/InventoryProtocol2FieldRows.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    @Test("many-value rows use a drag handle, unlabeled inputs, and swipe removal")
    func manyValueRowsUseTheCompactPattern() {
        #expect(Self.source.contains("showsLabel: false"))
        #expect(Self.source.contains(".onDrag"))
        #expect(Self.source.contains(".onDrop("))
        #expect(Self.source.contains(".popsGroundedSwipeActions("))
        #expect(!Self.source.contains("moveEarlierButton"))
        #expect(!Self.source.contains("moveLaterButton"))
        #expect(!Self.source.contains("removeButton"))
    }

    @Test("the many-value section does not render field help as a subtitle")
    func manyValueSectionOmitsRepeatedHelp() {
        guard
            let start = Self.source.range(of: "private var manyEditor"),
            let end = Self.source.range(
                of: "private func manyEntryRow", range: start.upperBound..<Self.source.endIndex)
        else {
            Issue.record("many-value editor source was not found")
            return
        }
        #expect(!Self.source[start.upperBound..<end.lowerBound].contains("field.help"))
    }
}
