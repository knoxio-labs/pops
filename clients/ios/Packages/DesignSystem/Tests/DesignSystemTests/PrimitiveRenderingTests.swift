import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

/// The previews claim each primitive renders in both colour schemes. Xcode's
/// canvas is the only place a human sees that, and nothing in CI opens it — so
/// the same views are rasterised here instead. Two renders of the same view in
/// the same scheme must be byte-identical, which is what makes the light/dark
/// comparison meaningful rather than noise.
@Suite("Primitive rendering")
@MainActor
internal struct PrimitiveRenderingTests {
    private static let canvas = CGSize(width: 320, height: 240)

    internal static func render(_ view: some View, in scheme: ColorScheme) -> Data? {
        let renderer = ImageRenderer(
            content:
                view
                .environment(\.colorScheme, scheme)
                .frame(width: canvas.width, height: canvas.height)
                .background(Color.popsBackground.environment(\.colorScheme, scheme))
        )
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }

    private static func check(_ view: some View, named name: String) throws {
        let light = try #require(render(view, in: .light), "\(name) failed to rasterise in light")
        let dark = try #require(render(view, in: .dark), "\(name) failed to rasterise in dark")
        let lightAgain = try #require(render(view, in: .light))

        #expect(
            light == lightAgain,
            "\(name) renders non-deterministically — the light/dark comparison below proves nothing"
        )
        #expect(light != dark, "\(name) renders identically in light and dark")
    }

    @Test("EmptyStateView")
    func emptyState() throws {
        try Self.check(
            EmptyStateView(message: "No transactions in this period."), named: "EmptyStateView")
    }

    @Test("ErrorStateView")
    func errorState() throws {
        try Self.check(
            ErrorStateView(message: "Could not reach the server.") {}, named: "ErrorStateView")
    }

    @Test("PopsButton")
    func button() throws {
        try Self.check(PopsButton("Pair") {}, named: "PopsButton")
    }

    @Test("PopsRow")
    func row() throws {
        try Self.check(PopsRow(title: "Rent", subtitle: "1 August"), named: "PopsRow")
    }

    @Test("PopsCard")
    func card() throws {
        try Self.check(
            PopsCard { PopsRow(title: "Groceries", subtitle: "12 transactions") }, named: "PopsCard"
        )
    }

    // LoadingStateView is excluded from the byte-comparison: `ProgressView`
    // animates, so two renders of it are not expected to match.
    @Test("LoadingStateView rasterises at all")
    func loadingState() throws {
        _ = try #require(Self.render(LoadingStateView(), in: .light))
        _ = try #require(Self.render(LoadingStateView(), in: .dark))
    }
}
