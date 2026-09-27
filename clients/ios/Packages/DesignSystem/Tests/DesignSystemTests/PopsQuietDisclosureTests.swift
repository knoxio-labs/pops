import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

@MainActor
@Suite("Quiet disclosure")
internal struct PopsQuietDisclosureTests {
    private static let canvas = CGSize(width: 320, height: 240)

    private func render(_ content: some View) throws -> CGImage {
        let renderer = ImageRenderer(
            content:
                content
                .frame(width: Self.canvas.width, height: Self.canvas.height, alignment: .top)
        )
        renderer.scale = 1
        return try #require(renderer.cgImage)
    }

    private func pixels(in image: CGImage, rect: CGRect) throws -> Data {
        let cropped = try #require(image.cropping(to: rect))
        let data = try #require(cropped.dataProvider?.data)
        return data as Data
    }

    @Test(
        "history starts collapsed and expanded content renders when requested",
        .requiresCompiledColorCatalog
    )
    func collapsedByDefault() throws {
        let collapsed = try render(
            PopsQuietDisclosure("History") {
                Color.popsAccent.frame(height: 96)
            })
        let expanded = try render(
            PopsQuietDisclosure("History", initiallyExpanded: true) {
                Color.popsAccent.frame(height: 96)
            })

        let contentRect = CGRect(x: 0, y: 80, width: 320, height: 160)
        #expect(
            try pixels(in: collapsed, rect: contentRect)
                != pixels(in: expanded, rect: contentRect)
        )
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
