import Foundation
import Testing

@Suite("Quiet disclosure wiring")
internal struct PopsQuietDisclosureTests {
    private static func source() throws -> String {
        let package = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        return try String(
            contentsOf: package.appending(
                path: "Sources/DesignSystem/Primitives/PopsQuietDisclosure.swift"),
            encoding: .utf8)
    }

    @Test("content starts hidden and the header toggles the same expansion state")
    func collapsedContentAndToggle() throws {
        let source = try Self.source()
        #expect(source.contains("@State private var isExpanded = false"))
        #expect(source.contains("isExpanded.toggle()"))
        #expect(source.contains("if isExpanded {\n                content\n            }"))
        #expect(source.contains("Text(isExpanded ? \"Hide\" : \"Show\")"))
    }

    @Test("the button exposes its state and keeps a full touch target")
    func accessibleExpansion() throws {
        let source = try Self.source()
        #expect(source.contains(".accessibilityLabel(title)"))
        #expect(source.contains(".accessibilityValue(isExpanded ? \"Expanded\" : \"Collapsed\")"))
        #expect(source.contains(".frame(minHeight: PopsSize.touchTarget)"))
    }

    @Test("secondary rows stay muted and carry no caret or navigation glyph")
    func quietRows() throws {
        let source = try Self.source()
        let row = try #require(
            source.components(separatedBy: "public struct PopsQuietDetailLine").last)
        #expect(row.contains(".font(.popsCaption)"))
        #expect(row.contains(".foregroundStyle(Color.popsMutedForeground)"))
        #expect(row.contains(".frame(minHeight: PopsSize.touchTarget)"))
        #expect(!row.contains("Image("))
        #expect(!row.contains("DisclosureGroup"))
    }
}
