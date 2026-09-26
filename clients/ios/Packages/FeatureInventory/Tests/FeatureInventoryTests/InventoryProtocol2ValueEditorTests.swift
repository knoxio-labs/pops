import Foundation
import Testing

@testable import FeatureInventory

@Suite("Protocol 2 value editor")
internal struct InventoryProtocol2ValueEditorTests {
    private static let source: String = {
        let url = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/Form/InventoryProtocol2ValueEditor.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    @Test("a measurement field keeps long hints on one leading-aligned line")
    func measurementFieldKeepsHintOnOneLine() {
        guard let start = Self.source.range(of: "private var measurementEditor"),
            let end = Self.source.range(
                of: "private var referenceEditor", range: start.upperBound..<Self.source.endIndex)
        else {
            #expect(Bool(false), "measurement editor is missing")
            return
        }
        let measurementEditor = String(Self.source[start.lowerBound..<end.lowerBound])

        #expect(measurementEditor.contains(".multilineTextAlignment(.leading)"))
        #expect(measurementEditor.contains(".lineLimit(1)"))
        #expect(!measurementEditor.contains(".multilineTextAlignment(.trailing)"))
    }
}
