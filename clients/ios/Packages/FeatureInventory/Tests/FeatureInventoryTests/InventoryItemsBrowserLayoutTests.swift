import DesignSystem
import Foundation
import Synchronization
import Testing

@testable import FeatureInventory

#if os(macOS) && canImport(AppKit)
    import AppKit
    import SwiftUI

    private struct FixedWidthLayout: Layout {
        let width: CGFloat

        func sizeThatFits(
            proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
        ) -> CGSize {
            guard let subview = subviews.first else { return .zero }
            let size = subview.sizeThatFits(ProposedViewSize(width: width, height: proposal.height))
            return CGSize(width: size.width, height: size.height)
        }

        func placeSubviews(
            in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
        ) {
            guard let subview = subviews.first else { return }
            subview.place(
                at: bounds.origin, anchor: .topLeading,
                proposal: ProposedViewSize(width: width, height: bounds.height))
        }
    }

    private final class SizeProbe: Sendable {
        let size = Mutex(CGSize.zero)
    }

    private struct SizeReportingLayout: Layout {
        let probe: SizeProbe

        func sizeThatFits(
            proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
        ) -> CGSize {
            guard let subview = subviews.first else { return .zero }
            let size = subview.sizeThatFits(proposal)
            probe.size.withLock { $0 = size }
            return size
        }

        func placeSubviews(
            in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
        ) {
            guard let subview = subviews.first else { return }
            subview.place(
                at: bounds.origin, anchor: .topLeading,
                proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
        }
    }

#endif

@Suite("Items browser layout")
internal struct InventoryItemsBrowserLayoutTests {
    private static let source: String = {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/Browse/InventoryItemsBrowserView.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    private static let rowSource: String = {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/Search/InventorySearchResultRow.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    @Test("the layout scan reads the production sources")
    func scanIsWiredUp() {
        #expect(!Self.source.isEmpty)
        #expect(!Self.rowSource.isEmpty)
    }

    @Test("the Items browser scrolls vertically inside a viewport-sized content column")
    func browserContentIsBoundToTheViewport() {
        #expect(Self.source.contains("ScrollView(.vertical)"))
        #expect(Self.source.contains(".containerRelativeFrame(.horizontal, alignment: .leading)"))
        #expect(Self.source.contains("InventoryItemsBrowserSkeleton"))
    }

    @Test("item rows give their descriptive column the width left by row controls")
    func rowDescriptionColumnIsFlexible() {
        #expect(Self.rowSource.contains(".frame(maxWidth: .infinity, alignment: .leading)"))
    }

    #if os(macOS) && canImport(AppKit)
        @Test("browser controls fit inside the phone viewport")
        @MainActor
        func browserControlsFitTheViewport() {
            let tiles = InventoryCountTiles(tiles: [
                InventoryCountTile(title: "Items", count: 60, symbol: "cube"),
                InventoryCountTile(title: "In hand", count: 0, symbol: "hand.raised"),
                InventoryCountTile(title: "Untyped", count: 0, symbol: "archivebox"),
                InventoryCountTile(title: "Recent", count: 60, symbol: "clock.arrow.circlepath"),
            ])
            let search = PopsSearchBar(
                query: .constant(""), tint: .popsInventory, prompt: "Search items",
                isFiltered: false, onFilter: {},
                add: PopsSearchBarAdd(label: "New item", action: {}))
            let host = NSHostingView(
                rootView: FixedWidthLayout(width: 320) {
                    VStack(spacing: PopsSpacing.lg) {
                        tiles
                        search
                    }
                })
            host.layoutSubtreeIfNeeded()

            #expect(
                host.fittingSize.width <= 320,
                "Measured browser controls at \(host.fittingSize.width) points")
        }

        @Test("the vertical scroll proposal keeps browser content inside its viewport")
        @MainActor
        func scrollContentFitsTheViewport() {
            let probe = SizeProbe()
            let tiles = InventoryCountTiles(tiles: [
                InventoryCountTile(title: "Items", count: 60, symbol: "cube"),
                InventoryCountTile(title: "In hand", count: 0, symbol: "hand.raised"),
                InventoryCountTile(title: "Untyped", count: 0, symbol: "archivebox"),
                InventoryCountTile(title: "Recent", count: 60, symbol: "clock.arrow.circlepath"),
            ])
            let search = PopsSearchBar(
                query: .constant(""), tint: .popsInventory, prompt: "Search items",
                isFiltered: false, onFilter: {},
                add: PopsSearchBarAdd(label: "New item", action: {}))
            let host = NSHostingView(
                rootView: FixedWidthLayout(width: 320) {
                    ScrollView(.vertical) {
                        InventoryBrowserScrollContent {
                            SizeReportingLayout(probe: probe) {
                                VStack(spacing: PopsSpacing.lg) {
                                    tiles
                                    search
                                }
                                .padding(.horizontal, PopsSpacing.lg)
                            }
                        }
                    }
                })
            host.layoutSubtreeIfNeeded()

            #expect(
                probe.size.withLock { $0.width } <= 320,
                "Measured scroll content at \(probe.size.withLock { $0.width }) points")
        }

        @Test("a long item code wraps inside the phone viewport")
        @MainActor
        func longCodeFitsTheRow() {
            let record = InventoryListFixture.record(
                "Long code", code: String(repeating: "A", count: 64))
            let shortRecord = InventoryListFixture.record("Short code", code: "A1")
            let row = InventoryRecordRowLabel(
                record: record, showsCode: true, loadPhoto: { _ in nil })
            let shortRow = InventoryRecordRowLabel(
                record: shortRecord, showsCode: true, loadPhoto: { _ in nil })
            let host = NSHostingView(rootView: FixedWidthLayout(width: 320) { row })
            let shortHost = NSHostingView(rootView: FixedWidthLayout(width: 320) { shortRow })
            host.layoutSubtreeIfNeeded()
            shortHost.layoutSubtreeIfNeeded()

            #expect(host.fittingSize.width <= 320)
            #expect(host.fittingSize.height > shortHost.fittingSize.height)
        }
    #endif
}
