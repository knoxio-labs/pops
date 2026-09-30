#if os(iOS)
    import Foundation
    import SwiftUI
    import Testing

    @testable import DesignSystem

    import UIKit

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

            try await fixture.waitForRow(0)
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
            try await fixture.waitForRow(9_999)
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

            func waitForRow(_ id: Int) async throws {
                try await counter.waitForAppearance(id)
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
                return view.subviews.lazy.compactMap { Self.scrollView(in: $0) }.first
            }
        }

        @MainActor
        private final class RowWorkCounter {
            private let appearances: AsyncStream<Int>
            private let appearanceContinuation: AsyncStream<Int>.Continuation
            private(set) var bodyRows: Set<Int> = []
            private(set) var assetRows: Set<Int> = []
            private(set) var activeRows: Set<Int> = []
            private(set) var activeAssetRows: Set<Int> = []

            init() {
                (appearances, appearanceContinuation) = AsyncStream.makeStream(of: Int.self)
            }

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
                _ = appearanceContinuation.yield(id)
            }

            func disappear(_ id: Int) {
                activeRows.remove(id)
                activeAssetRows.remove(id)
            }

            func waitForAppearance(_ id: Int) async throws {
                guard !activeRows.contains(id) else { return }
                let appearances = self.appearances
                let appeared = await withTaskGroup(of: Bool.self) { group in
                    group.addTask {
                        for await appearedID in appearances where appearedID == id {
                            return true
                        }
                        return false
                    }
                    group.addTask {
                        do {
                            try await Task.sleep(for: .seconds(5))
                            return false
                        } catch {
                            return false
                        }
                    }
                    let appeared = await group.next() ?? false
                    group.cancelAll()
                    await group.waitForAll()
                    return appeared
                }
                guard appeared else { throw AppearanceWaitError.timedOut }
            }
        }

        private enum AppearanceWaitError: Error {
            case timedOut
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
