import DesignSystemTestSupport
import SwiftUI
import Testing

@testable import DesignSystem

@MainActor
@Suite("Shared list primitives")
internal struct PopsListPanelTests {
    private struct Row: Identifiable {
        let id: Int
    }

    @Test(
        "a list panel is the shared insets over the shared ground",
        .requiresCompiledColorCatalog, arguments: ColorScheme.allCases)
    func panelMatchesItsModifiers(scheme: ColorScheme) throws {
        let panel = try #require(
            PrimitiveRenderingTests.render(
                PopsListPanel { Text("Stored here") }, in: scheme))
        let composed = try #require(
            PrimitiveRenderingTests.render(
                Text("Stored here").popsPanelInsets().popsPanelGround(), in: scheme))

        #expect(RenderedPixels.drawTheSame(panel, composed))
    }

    @Test("the panel ground draws a surface around bare content", .requiresCompiledColorCatalog)
    func groundChangesTheDrawing() throws {
        let bare = try #require(
            PrimitiveRenderingTests.render(Text("Stored here"), in: .light))
        let grounded = try #require(
            PrimitiveRenderingTests.render(Text("Stored here").popsPanelGround(), in: .light))

        #expect(!RenderedPixels.drawTheSame(bare, grounded))
    }

    @Test("a section header draws its trailing summary", .requiresCompiledColorCatalog)
    func sectionHeaderTrailingChangesTheDrawing() throws {
        let titleOnly = try #require(
            PrimitiveRenderingTests.render(PopsSectionHeader(title: "Places"), in: .light))
        let withCount = try #require(
            PrimitiveRenderingTests.render(
                PopsSectionHeader(title: "Places", trailing: "12"), in: .light))

        #expect(!RenderedPixels.drawTheSame(titleOnly, withCount))
    }

    @Test(
        "divider count has one separator between each pair",
        arguments: [(rows: 0, dividers: 0), (rows: 1, dividers: 0), (rows: 4, dividers: 3)])
    func dividerCount(sample: (rows: Int, dividers: Int)) {
        #expect(PopsDividedRows<Row, Text>.dividerCount(rows: sample.rows) == sample.dividers)
    }

    @Test("a notice action changes the rendered notice", .requiresCompiledColorCatalog)
    func noticeActionChangesTheDrawing() throws {
        let withoutAction = PopsNotice(
            symbol: "exclamationmark.triangle", tint: .popsWarning, text: "Needs attention"
        )
        .environment(\._accessibilityReduceMotion, true)
        let withAction = PopsNotice(
            symbol: "exclamationmark.triangle", tint: .popsWarning, text: "Needs attention"
        ) {
            Text("Review")
        }
        .environment(\._accessibilityReduceMotion, true)

        let withoutActionPixels = try #require(
            PrimitiveRenderingTests.render(withoutAction, in: .light))
        let withActionPixels = try #require(
            PrimitiveRenderingTests.render(withAction, in: .light))

        #expect(!RenderedPixels.drawTheSame(withoutActionPixels, withActionPixels))
    }
}
