internal enum PurchasePageViewerLogic {
    /// Where `pageID` sits: its receipt's position, and its photo position when the receipt has more
    /// than one page. `nil` when no staged receipt holds the page.
    internal static func location(of pageID: String, in receipts: [StagedReceipt]) -> String? {
        guard
            let receiptIndex = receipts.firstIndex(where: {
                $0.pages.contains { $0.id == pageID }
            })
        else { return nil }
        let receipt = receipts[receiptIndex]
        let name = "Receipt \(receiptIndex + 1)"
        guard receipt.pages.count > 1,
            let pageIndex = receipt.pages.firstIndex(where: { $0.id == pageID })
        else { return "\(name) · on its own" }
        return "\(name) · photo \(pageIndex + 1) of \(receipt.pages.count)"
    }

    /// The page `delta` steps from `pageID` across every staged page, or `nil` past either end or
    /// when `pageID` is no longer staged.
    internal static func step(
        from pageID: String, by delta: Int, in pages: [StagedPage]
    ) -> String? {
        guard let index = pages.firstIndex(where: { $0.id == pageID }) else { return nil }
        let next = index + delta
        return pages.indices.contains(next) ? pages[next].id : nil
    }

    /// Marks `page` pending before handing it to a source, so the page that comes back takes its
    /// receipt and position.
    @MainActor internal static func replace(
        _ page: StagedPage, in model: PurchaseStagingModel, using source: (StagedPage) -> Void
    ) {
        model.beginReplacing(page.id)
        source(page)
    }
}
