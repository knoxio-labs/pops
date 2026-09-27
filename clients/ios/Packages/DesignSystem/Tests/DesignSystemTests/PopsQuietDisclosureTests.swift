import SwiftUI
import Testing

@testable import DesignSystem

@MainActor
@Suite("Quiet disclosure")
internal struct PopsQuietDisclosureTests {
    private static let canvas = CGSize(width: 320, height: 240)

    private func render(_ content: some View) throws -> Data {
        let renderer = ImageRenderer(
            content:
                content
                .frame(width: Self.canvas.width, height: Self.canvas.height)
        )
        renderer.scale = 1
        let image = try #require(renderer.cgImage)
        let pixels = try #require(image.dataProvider?.data)
        return pixels as Data
    }

    @Test(
        "history starts collapsed and expanded content renders when requested",
        .requiresCompiledColorCatalog
    )
    func collapsedByDefault() throws {
        let collapsed = try render(
            PopsQuietDisclosure("History") {
                Text("Moved")
            })
        let expanded = try render(
            PopsQuietDisclosure("History", initiallyExpanded: true) {
                Text("Moved")
            })

        #expect(collapsed != expanded)
    }

    @Test("the disclosure exposes its expansion state and keeps a touch target")
    func accessibilityAndTouchTarget() throws {
        let source = try String(
            contentsOf: URL(filePath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appending(path: "Sources/DesignSystem/Primitives/PopsQuietDisclosure.swift"),
            encoding: .utf8
        )

        #expect(source.contains(".accessibilityValue(isExpanded ? \"Expanded\" : \"Collapsed\")"))
        #expect(source.contains(".frame(minHeight: PopsSize.touchTarget)"))
    }
}
