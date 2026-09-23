import Foundation
import Testing

@Suite("Purchase detail screen wiring")
internal struct PurchaseDetailScreenWiringTests {
    @Test("the task loads and every model phase has a production state")
    func phaseAssembly() {
        #expect(Self.screen.contains(".task { await model.load() }"))
        #expect(Self.screen.contains("case .loading:"))
        #expect(Self.screen.contains("case .loaded(let detail, let refresh):"))
        #expect(Self.screen.contains("case .failed(let failure):"))
        #expect(Self.screen.contains("PurchaseDetailSkeleton()"))
        #expect(Self.screen.contains("PurchaseDetailFailureView(failure: failure)"))
    }

    @Test("a retained refresh failure retries without replacing loaded content")
    func refreshNotice() {
        #expect(Self.screen.contains("PurchaseDetailCopy.refreshNotice(for: refresh)"))
        #expect(Self.screen.contains("Task { await model.refresh() }"))
        #expect(Self.screen.contains(".accessibilityLabel(\"Retry\")"))
    }

    @Test("Edit lands its saved detail exactly once and has no placeholder state")
    func liveEdit() throws {
        #expect(Self.screen.contains("Button(\"Edit\") { editing = true }"))
        #expect(Self.screen.contains("PurchaseEditSheet("))
        #expect(Self.screen.contains("PurchaseEditRequest(detail: detail)"))
        #expect(Self.screen.components(separatedBy: "model.applySaved(saved)").count == 2)
        #expect(!Self.screen.contains("disabled(true)"))

        let request = try #require(Self.screen.range(of: "PurchaseEditRequest(detail: detail)"))
        let saved = try #require(
            Self.screen.range(
                of: "model.applySaved(saved)", range: request.upperBound..<Self.screen.endIndex))
        let completion = Self.screen[request.lowerBound..<saved.upperBound]
        #expect(!completion.contains("model.refresh()"))
    }

    @Test("Share uses the loaded detail's exact share copy")
    func sharing() {
        #expect(Self.screen.contains("ShareLink(item: PurchaseDetailCopy.shareText(detail))"))
        #expect(Self.screen.contains("PurchaseDetailAccessibility.share"))
    }

    @Test("the receipt plate stages the shared pager and swipes request their page")
    func receiptViewer() {
        #expect(Self.screen.contains("PurchaseDetailAccessibility.root"))
        #expect(Self.screen.contains("PurchaseReceiptSelection(index: index)"))
        #expect(Self.screen.contains("model.openReceipt(at: index)"))
        #expect(Self.screen.contains(".popsStage(item: $viewing)"))
        #expect(Self.viewer.contains("PopsPagedPhotoViewer("))
        #expect(Self.viewer.contains("model.openReceipt(at: index)"))
        #expect(Self.viewer.contains("PurchaseDetailAccessibility.viewerClose"))
        #expect(Self.header.contains("PurchaseDetailAccessibility.receiptPlate"))
    }

    @Test("stable automation identifiers retain their public spelling")
    func stableIdentifiers() {
        #expect(Self.accessibility.contains("\"purchase-detail\""))
        #expect(Self.accessibility.contains("\"purchase-detail-receipt\""))
        #expect(Self.accessibility.contains("\"purchase-detail-edit\""))
        #expect(Self.accessibility.contains("\"purchase-detail-share\""))
        #expect(Self.accessibility.contains("\"purchase-detail-viewer-close\""))
    }

    private static let screen = source("PurchaseDetailScreen.swift")
    private static let header = source("Detail/PurchaseDetailHeader.swift")
    private static let viewer = source("Detail/PurchaseReceiptViewer.swift")
    private static let accessibility = source("Detail/PurchaseDetailAccessibility.swift")

    private static func source(_ path: String) -> String {
        let packageRoot = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        return
            (try? String(
                contentsOf: packageRoot.appending(path: "Sources/FeaturePurchases/\(path)"),
                encoding: .utf8)) ?? ""
    }
}
