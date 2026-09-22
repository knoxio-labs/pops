import AppCore
import AppCoreFakes
import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import FeaturePurchases

@Suite("Purchase reading rendering")
@MainActor
internal struct PurchaseReadingRenderingTests {
    @Test("read and unreadable receipts present distinct outcomes", .requiresCompiledColorCatalog)
    func settledOutcomesDiffer() throws {
        let read = try #require(Self.render(Self.row(outcome: .read(Self.reading))))
        let unreadable = try #require(
            Self.render(Self.row(outcome: .unreadable(reason: "No total found"))))

        #expect(!RenderedPixels.drawTheSame(read, unreadable))
    }

    @Test("waiting and completed receipts present distinct states", .requiresCompiledColorCatalog)
    func waitingDiffersFromCompleted() throws {
        let waiting = try #require(Self.render(Self.row(outcome: .queued)))
        let read = try #require(Self.render(Self.row(outcome: .read(Self.reading))))

        #expect(!RenderedPixels.drawTheSame(waiting, read))
    }

    private static let reading = ReceiptDraftReading(
        receiptUris: [],
        reconciled: true,
        failures: [],
        extracted: .fake(merchantName: nil),
        capture: nil)

    private static func row(outcome: PurchaseReadingRow.Outcome) -> PurchaseReadingRowView {
        PurchaseReadingRowView(
            row: PurchaseReadingRow(
                id: "receipt",
                parts: [ReceiptPart(mediaType: .plainText, data: Data("receipt".utf8))],
                outcome: outcome))
    }

    private static func render(_ view: some View) -> Data? {
        let renderer = ImageRenderer(
            content:
                view
                .padding()
                .environment(\._accessibilityReduceMotion, true)
                .environment(\.colorScheme, .light)
                .frame(width: 390, height: 120)
        )
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }
}
