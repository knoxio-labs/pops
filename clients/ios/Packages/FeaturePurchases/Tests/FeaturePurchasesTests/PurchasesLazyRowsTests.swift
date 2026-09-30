import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchases lazy rows")
internal struct PurchasesLazyRowsTests {
    private static let packageRoot = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()

    private static let archive = source("Sources/FeaturePurchases/PurchasesArchiveScreen.swift")
    private static let home = source("Sources/FeaturePurchases/Home/PurchasesHomeStatus.swift")
    private static let receipt = source(
        "Sources/FeaturePurchases/Detail/PurchaseDetailReceipt.swift")
    private static let bankMatch = source(
        "Sources/FeaturePurchases/Detail/PurchaseBankMatchSection.swift")
    private static let staging = source(
        "Sources/FeaturePurchases/Capture/Staging/PurchaseStagingGrid.swift")
    private static let draft = source(
        "Sources/FeaturePurchases/Draft/ReceiptDraftForm.swift")
    private static let recordSearch = source(
        "Sources/FeaturePurchases/Draft/ReceiptDraftRecordSheet.swift")
    private static let pendingTile = source(
        "Sources/FeaturePurchases/Capture/Staging/StagedPendingTile.swift")
    private static let tagPicker = source(
        "Sources/FeaturePurchases/Search/PurchasesTagPicker.swift")

    @Test("months and purchase rows are hosted by lazy stacks")
    func archiveCollectionsAreLazy() {
        #expect(Self.archive.contains("LazyVStack("))
        #expect(Self.archive.contains("ForEach(model.months)"))
        #expect(Self.archive.contains("PurchaseRowsPanel(rows: month.purchases)"))
        #expect(Self.archive.contains("PurchasesArchiveSkeleton(rows: 6, showsMonth: true)"))
        #expect(Self.archive.contains("PurchasesArchiveSkeleton(rows: 2, showsMonth: false)"))
        #expect(Self.home.contains("PurchaseRowSkeleton()"))
    }

    @Test("receipt lines and bank-match rows defer row construction")
    func detailCollectionsAreLazy() {
        #expect(Self.receipt.contains("PopsDividedRows(rows: detail.lines"))
        #expect(Self.receipt.contains("LazyVStack(alignment: .leading, spacing: PopsSpacing.xs)"))
        #expect(
            Self.bankMatch.contains("LazyVStack(alignment: .leading, spacing: PopsSpacing.zero)"))
        #expect(Self.bankMatch.contains("ForEach(presentation.rows)"))
        #expect(Self.bankMatch.contains("reduceMotion ? .identity : PopsMotion.row"))
    }

    @Test("staged receipt pages and editable receipt rows are lazy")
    func nestedReceiptCollectionsAreLazy() {
        #expect(Self.staging.contains("LazyVStack(alignment: .leading, spacing: PopsSpacing.lg)"))
        #expect(Self.staging.contains("LazyHStack(spacing: PopsSpacing.md)"))
        #expect(Self.draft.contains("LazyVStack(alignment: .leading, spacing: PopsSpacing.lg)"))
    }

    @Test("record and receipt-asset loading use placeholders instead of list spinners")
    func listLoadingPlaceholders() {
        #expect(Self.recordSearch.contains("ReceiptDraftRecordSkeleton()"))
        #expect(Self.pendingTile.contains("Loading receipt image"))
        #expect(Self.tagPicker.contains("PurchasesTagRowSkeleton()"))
        #expect(Self.tagPicker.contains(".popsMotion(value: model.pageRevision)"))
        #expect(Self.tagPicker.contains(".popsMotion(value: model.paging)"))
        #expect(Self.tagPicker.contains(".transition(reduceMotion ? .identity : PopsMotion.row)"))
        #expect(!Self.recordSearch.contains("ProgressView"))
        #expect(!Self.pendingTile.contains("ProgressView"))
    }

    private static func source(_ relativePath: String) -> String {
        let path = packageRoot.appending(path: relativePath)
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }
}
