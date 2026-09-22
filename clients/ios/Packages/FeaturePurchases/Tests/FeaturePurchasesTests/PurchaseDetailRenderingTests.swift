import AppCore
import AppCoreFakes
import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import FeaturePurchases

@Suite("Purchase detail rendering")
@MainActor
internal struct PurchaseDetailRenderingTests {
    private static let canvas = CGSize(width: 390, height: 760)

    @Test("the loading state rasterises")
    func loadingStateRasterises() throws {
        _ = try #require(Self.render(PurchaseDetailSkeleton()))
    }

    @Test("a receipt preview changes the header", .requiresCompiledColorCatalog)
    func receiptPreviewChangesHeader() throws {
        let png = try #require(PopsTestImage.pngData())
        let detail = PurchaseDetail.fake(receiptURIs: ["pops://receipt/sha256/page-one"])
        let withoutReceipt = try #require(
            Self.render(PurchaseDetailHeader(detail: detail, receiptPages: [], open: { _ in })))
        let withReceipt = try #require(
            Self.render(
                PurchaseDetailHeader(
                    detail: detail,
                    receiptPages: [
                        PurchaseReceiptThumbnail(
                            pageIndex: 0, image: .fake(mediaType: "image/png", data: png))
                    ],
                    open: { _ in }
                )))

        #expect(!RenderedPixels.drawTheSame(withoutReceipt, withReceipt))
    }

    @Test("itemised and empty receipts render differently", .requiresCompiledColorCatalog)
    func receiptStatesDiffer() throws {
        let empty = try #require(
            Self.render(
                PurchaseDetailReceipt(
                    detail: .fake(
                        subtotal: Self.money(0), lines: []
                    ))))
        let itemised = try #require(
            Self.render(
                PurchaseDetailReceipt(
                    detail: .fake(
                        purchase: .fake(total: Self.money(550)), subtotal: Self.money(500),
                        tax: Self.money(50),
                        lines: [.fake(name: "Bread", lineTotal: Self.money(500))]
                    ))))

        #expect(!RenderedPixels.drawTheSame(empty, itemised))
    }

    @Test("settlement states render distinct match rows", .requiresCompiledColorCatalog)
    func matchStatesDiffer() throws {
        let awaiting = try #require(
            Self.render(PurchaseDetailMatchRow(status: .awaitingSettlement)))
        let linked = try #require(Self.render(PurchaseDetailMatchRow(status: .linked)))

        #expect(!RenderedPixels.drawTheSame(awaiting, linked))
    }

    @Test("retryable and terminal failures render differently", .requiresCompiledColorCatalog)
    func failureStatesDiffer() throws {
        let retryable = try #require(
            Self.render(PurchaseDetailFailureView(failure: .offline, retry: {})))
        let terminal = try #require(
            Self.render(PurchaseDetailFailureView(failure: .notFound, retry: {})))

        #expect(!RenderedPixels.drawTheSame(retryable, terminal))
    }

    @Test("loading and failure states render differently", .requiresCompiledColorCatalog)
    func topLevelStatesDiffer() throws {
        let loading = try #require(Self.render(PurchaseDetailSkeleton()))
        let failed = try #require(
            Self.render(PurchaseDetailFailureView(failure: .unauthorized, retry: {})))

        #expect(!RenderedPixels.drawTheSame(loading, failed))
    }

    private static func render(_ view: some View) -> Data? {
        let renderer = ImageRenderer(
            content:
                view
                .environment(\._accessibilityReduceMotion, true)
                .environment(\.colorScheme, .light)
                .frame(width: canvas.width, height: canvas.height)
        )
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }

    private static func money(_ cents: Int) -> MoneyAmount {
        MoneyAmount(minorUnits: cents, currencyCode: "AUD")
    }
}
