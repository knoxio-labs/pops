import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

@MainActor
@Suite("Shared list primitives")
internal struct PopsListPanelTests {
    private struct Row: Identifiable {
        let id: Int
    }

    private static let source: String = {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/DesignSystem/Primitives/PopsListPanel.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

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

    @Test("divided rows draw the same inset separators as a regular stack")
    func dividedRowsPreserveSeparators() throws {
        let rows = [Row(id: 1), Row(id: 2), Row(id: 3)]
        let divided = PopsDividedRows(rows: rows, leadingInset: 24) { row in
            Text("Row \(row.id)").frame(height: 36)
        }
        let regular = VStack(alignment: .leading, spacing: PopsSpacing.zero) {
            ForEach(rows) { row in
                Text("Row \(row.id)").frame(height: 36)
                if row.id != rows.last?.id {
                    PopsDivider().padding(.leading, 24)
                }
            }
        }

        let dividedPixels = try #require(
            PrimitiveRenderingTests.render(divided, in: .light))
        let regularPixels = try #require(
            PrimitiveRenderingTests.render(regular, in: .light))

        #expect(RenderedPixels.drawTheSame(dividedPixels, regularPixels))
    }

    @Test("row changes animate unless Reduce Motion is enabled")
    func rowMotionFollowsReduceMotionSetting() {
        #expect(!Self.source.isEmpty)
        #expect(
            Self.source.contains(".transition(reduceMotion ? .identity : PopsMotion.row)"),
            "PopsDividedRows must not scale or fade rows when Reduce Motion is enabled"
        )
        #expect(
            Self.source.contains(".popsMotion(value: rows.map(\\.id))"),
            "row insertion and removal must animate when the row IDs change"
        )
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
