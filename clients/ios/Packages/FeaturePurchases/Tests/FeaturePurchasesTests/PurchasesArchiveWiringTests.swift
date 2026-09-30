import Foundation
import Testing

@Suite("Purchases archive wiring")
internal struct PurchasesArchiveWiringTests {
    private static let source: String = {
        let packageRoot = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let path = packageRoot.appending(
            path: "Sources/FeaturePurchases/PurchasesArchiveScreen.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    @Test("the source scan reads the archive screen")
    func sourceExists() { #expect(!Self.source.isEmpty) }

    @Test("the last rows trigger paging and the footer only reports request state")
    func rowsTriggerNextPage() {
        #expect(Self.source.contains("case .loading:"))
        #expect(Self.source.contains(".task("))
        #expect(
            Self.source.contains(
                "ArchivePrefetchTask(scope: model.scope, purchaseID: purchase.id)"))
        #expect(Self.source.contains("await model.loadNextPageIfNeeded(when: purchase.id)"))
        #expect(!Self.source.contains(".task(id: model.nextPageCursor)"))
    }

    @Test("the failed footer retries only through the model")
    func footerRetries() {
        #expect(Self.source.contains("case .failed:"))
        #expect(Self.source.contains("Task { await model.retryNextPage() }"))
    }

    @Test("month headers use the shared section header")
    func sharedHeaders() {
        #expect(Self.source.contains("PopsSectionHeader("))
        #expect(Self.source.contains("month.isIncomplete ? \"\\(joined) so far\" : joined"))
    }

    @Test("rows navigate by value inside the flow stack")
    func valueNavigation() {
        #expect(Self.source.contains("NavigationLink(value: PurchasesScreenRoute.detail"))
        #expect(!Self.source.contains("NavigationLink(destination:"))
    }
}
