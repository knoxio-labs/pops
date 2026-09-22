import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

@MainActor
@Suite("Pops bar items")
internal struct PopsBarItemsTests {
    private static let canvas = CGSize(width: 320, height: 240)

    private func render(_ content: some View) -> Data? {
        let renderer = ImageRenderer(
            content: NavigationStack { content }
                .frame(width: Self.canvas.width, height: Self.canvas.height)
        )
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }

    @Test("the trailing helper renders its item")
    func trailingItemRenders() throws {
        _ = try #require(
            render(Text("Receipt").popsTrailingBarItem { Text("Commit") }))
    }

    @Test("the bottom helper renders its items")
    func bottomItemsRender() throws {
        _ = try #require(
            render(
                Text("Receipt").popsBottomBar {
                    Text("Discard")
                    Text("Review")
                }))
    }

    @Test("the helpers install their platform toolbar placements")
    func helpersInstallToolbarPlacements() throws {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let sourceURL = packageRoot.appending(
            path: "Sources/DesignSystem/Primitives/PopsBarItemsPlatform.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)

        #expect(source.contains("ToolbarItem(placement: .topBarTrailing, content: item)"))
        #expect(source.contains("toolbar { ToolbarItem(content: item) }"))
        #expect(source.contains("ToolbarItemGroup(placement: .bottomBar, content: items)"))
        #expect(source.contains("toolbar { ToolbarItemGroup(content: items) }"))
    }
}
