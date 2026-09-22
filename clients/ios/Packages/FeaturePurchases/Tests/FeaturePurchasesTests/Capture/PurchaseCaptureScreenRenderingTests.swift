import AppCore
import AppCoreFakes
import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import FeaturePurchases

@Suite("Purchase capture screen rendering")
@MainActor
internal struct PurchaseCaptureScreenRenderingTests {
    @Test(
        "reading screen distinguishes an empty batch from queued work",
        .requiresCompiledColorCatalog)
    func readingBatchStatesDiffer() throws {
        let repository = InMemoryReceiptCaptureRepository()
        let empty = PurchaseReadingView(
            model: PurchaseReadingViewModel(receipts: [], repository: repository),
            onCancel: {},
            onReview: { _ in })
        let queued = PurchaseReadingView(
            model: PurchaseReadingViewModel(
                receipts: [StagedReceiptForReading(id: "receipt", parts: [Self.part])],
                repository: repository),
            onCancel: {},
            onReview: { _ in })

        let emptyPixels = try #require(Self.render(empty))
        let queuedPixels = try #require(Self.render(queued))

        #expect(!RenderedPixels.drawTheSame(emptyPixels, queuedPixels))
    }

    @Test(
        "staging grid distinguishes an empty selection from staged pages",
        .requiresCompiledColorCatalog)
    func stagingStatesDiffer() throws {
        let empty = Self.staging(PurchaseStagingModel())
        let populated = Self.staging(
            PurchaseStagingModel(
                receipts: [
                    StagedReceipt(
                        id: "receipt",
                        pages: [
                            StagedPage(id: "first", label: "First page", part: Self.part),
                            StagedPage(id: "second", label: "Second page", part: Self.part),
                        ])
                ]))

        let emptyPixels = try #require(Self.render(empty))
        let populatedPixels = try #require(Self.render(populated))

        #expect(!RenderedPixels.drawTheSame(emptyPixels, populatedPixels))
    }

    private static let part = ReceiptPart(
        mediaType: .plainText,
        data: Data("receipt".utf8))

    private static func staging(_ model: PurchaseStagingModel) -> PurchaseStagingGrid {
        PurchaseStagingGrid(
            model: model,
            onRead: {},
            onCancel: {},
            onAdd: { _ in },
            onReplace: { _, _ in })
    }

    private static func render(_ view: some View) -> Data? {
        let renderer = ImageRenderer(
            content:
                NavigationStack { view }
                .environment(\._accessibilityReduceMotion, true)
                .environment(\.colorScheme, .light)
                .frame(width: 390, height: 640)
        )
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }
}
