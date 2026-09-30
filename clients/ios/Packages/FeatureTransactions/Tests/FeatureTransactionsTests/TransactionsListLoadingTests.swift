import DesignSystem
import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import FeatureTransactions

@MainActor
@Suite("Transactions list loading presentation")
internal struct TransactionsListLoadingTests {
    private static let sourceDirectory = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appending(path: "Sources/FeatureTransactions")

    private static let canvas = CGSize(width: 390, height: 844)

    private func source(_ file: String) throws -> String {
        try String(contentsOf: Self.sourceDirectory.appending(path: file), encoding: .utf8)
    }

    private func render(_ view: some View) -> Data? {
        let renderer = ImageRenderer(
            content: view.frame(width: Self.canvas.width, height: Self.canvas.height))
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }

    @Test("initial loading draws transaction row skeletons", .requiresCompiledColorCatalog)
    func initialLoadingDrawsContentShapes() throws {
        let skeleton = try #require(render(TransactionsListSkeleton()))
        let background = try #require(render(Color.popsBackground))

        #expect(skeleton != background)
    }

    @Test("paging placeholders are shaped like transaction rows", .requiresCompiledColorCatalog)
    func nextPageDrawsContentShapes() throws {
        let skeleton = try #require(render(TransactionPageSkeleton()))
        let background = try #require(render(Color.popsBackground))

        #expect(skeleton != background)
    }

    @Test("list loading and row changes use skeletons and reduced-motion-aware transitions")
    func listUsesSkeletonsAndMotion() throws {
        let list = try source("TransactionsListView.swift")

        #expect(list.contains("TransactionsListSkeleton()"))
        #expect(list.contains("TransactionPageSkeleton()"))
        #expect(
            list.contains(
                "TransactionRowSkeleton(accessibilityLabel: TransactionsCopy.refreshing)"))
        #expect(!list.contains("LoadingStateView(message: TransactionsCopy.loading)"))
        #expect(list.contains(".popsMotion(PopsMotion.smooth, value: model.state)"))
        #expect(list.contains(".popsMotion(PopsMotion.smooth, value: model.paging)"))
        #expect(list.contains(".transition(PopsMotion.row)"))
    }

    @Test("transaction list and detail fields remain in lazy stacks")
    func listAndDetailCollectionsAreLazy() throws {
        let list = try source("TransactionsListView.swift")
        let detail = try source("TransactionDetailCard.swift")

        #expect(list.contains("LazyVStack(alignment: .leading, spacing: PopsSpacing.zero)"))
        #expect(list.contains("ForEach(transactions)"))
        #expect(detail.contains("LazyVStack(alignment: .leading, spacing: PopsSpacing.md)"))
        #expect(detail.contains("ForEach(content.fields)"))
    }
}
