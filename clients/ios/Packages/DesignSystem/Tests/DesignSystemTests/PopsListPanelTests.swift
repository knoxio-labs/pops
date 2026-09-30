import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

#if os(iOS)
    import UIKit
#endif

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

#if os(iOS)
    @MainActor
    @Suite("Large divided lists")
    internal struct PopsDividedRowsPerformanceTests {
        private struct Row: Identifiable {
            let id: Int
        }

        @Test("10,000 divided rows construct and start row work only near the viewport")
        func largeListKeepsRowAndAssetWorkBounded() async throws {
            let fixture = try ListFixture()
            defer { fixture.dismiss() }

            await fixture.settle()
            let scrollView = try #require(
                fixture.scrollView, "the list did not create a scroll view")
            #expect(scrollView.contentSize.height > scrollView.bounds.height * 1_000)

            let top = fixture.work
            #expect(top.bodyRows.contains(0))
            #expect(top.assetRows.contains(0))
            #expect(top.bodyRows.count <= 60)
            #expect(top.assetRows.count <= 60)
            #expect(top.activeRows.count <= 40)
            #expect(top.activeAssetRows.count <= 40)

            fixture.scrollToBottom(scrollView)
            await fixture.settle()
            let bottom = fixture.work
            #expect(bottom.bodyRows.contains(9_999))
            #expect(bottom.assetRows.contains(9_999))
            #expect(bottom.bodyRows.count <= 100)
            #expect(bottom.assetRows.count <= 100)
            #expect(bottom.bodyRows.contains(0))
            #expect(bottom.assetRows.contains(0))
            #expect(bottom.activeRows.contains(9_999))
            #expect(bottom.activeAssetRows.contains(9_999))
            #expect(bottom.activeRows.count <= 40)
            #expect(bottom.activeAssetRows.count <= 40)
        }

        private struct WorkSnapshot {
            let bodyRows: Set<Int>
            let assetRows: Set<Int>
            let activeRows: Set<Int>
            let activeAssetRows: Set<Int>
        }

        @MainActor
        private final class ListFixture {
            private let counter: RowWorkCounter
            private let window: UIWindow
            private let host: UIHostingController<AnyView>

            init() throws {
                let counter = RowWorkCounter()
                let rows = (0..<10_000).map(Row.init(id:))
                let list = ScrollView {
                    PopsDividedRows(rows: rows, leadingInset: 0) { row in
                        CountedRow(row: row, counter: counter)
                    }
                }
                .frame(width: 320, height: 440)

                let scenes = UIApplication.shared.connectedScenes.compactMap {
                    $0 as? UIWindowScene
                }
                let scene = try #require(scenes.first, "a simulator window scene is required")
                let window = UIWindow(windowScene: scene)
                let host = UIHostingController(rootView: AnyView(list))
                self.counter = counter
                self.window = window
                self.host = host
                window.frame = CGRect(x: 0, y: 0, width: 320, height: 440)
                window.rootViewController = host
                window.makeKeyAndVisible()
            }

            var scrollView: UIScrollView? {
                Self.scrollView(in: host.view)
            }

            var work: WorkSnapshot {
                counter.snapshot
            }

            func settle() async {
                for _ in 0..<6 {
                    await Task.yield()
                    window.layoutIfNeeded()
                    host.view.layoutIfNeeded()
                }
            }

            func scrollToBottom(_ scrollView: UIScrollView) {
                scrollView.setContentOffset(
                    CGPoint(x: 0, y: scrollView.contentSize.height - scrollView.bounds.height),
                    animated: false)
            }

            func dismiss() {
                window.isHidden = true
            }

            private static func scrollView(in view: UIView) -> UIScrollView? {
                if let scrollView = view as? UIScrollView, scrollView.contentSize.height > 0 {
                    return scrollView
                }
                for child in view.subviews {
                    if let scrollView = scrollView(in: child) { return scrollView }
                }
                return nil
            }
        }

        @MainActor
        private final class RowWorkCounter {
            private(set) var bodyRows: Set<Int> = []
            private(set) var assetRows: Set<Int> = []
            private(set) var activeRows: Set<Int> = []
            private(set) var activeAssetRows: Set<Int> = []

            var snapshot: WorkSnapshot {
                WorkSnapshot(
                    bodyRows: bodyRows,
                    assetRows: assetRows,
                    activeRows: activeRows,
                    activeAssetRows: activeAssetRows)
            }

            func recordBody(_ id: Int) { bodyRows.insert(id) }
            func appear(_ id: Int) {
                activeRows.insert(id)
                assetRows.insert(id)
                activeAssetRows.insert(id)
            }

            func disappear(_ id: Int) {
                activeRows.remove(id)
                activeAssetRows.remove(id)
            }
        }

        @MainActor
        private struct CountedRow: View {
            let row: Row
            let counter: RowWorkCounter

            init(row: Row, counter: RowWorkCounter) {
                self.row = row
                self.counter = counter
                counter.recordBody(row.id)
            }

            var body: some View {
                Text("Row \(row.id)")
                    .frame(height: 44)
                    .onAppear { counter.appear(row.id) }
                    .onDisappear { counter.disappear(row.id) }
            }
        }
    }
#endif
