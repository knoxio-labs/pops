import AppCore
import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import FeaturePurchases

@Suite("Purchase original values rendering")
@MainActor
internal struct PurchaseOriginalRenderingTests {
    private static let canvas = CGSize(width: 390, height: 160)

    @Test(
        "Original changes the edited notice only when field history exists",
        .requiresCompiledColorCatalog)
    func originalActionChangesNotice() throws {
        let editedAt = Date(timeIntervalSince1970: 0)
        let empty = try #require(
            Self.render(
                PurchaseDetailEditedNotice(
                    edit: PurchaseEdit(editedAt: editedAt, changes: []), showOriginal: {})))
        let changed = try #require(
            Self.render(
                PurchaseDetailEditedNotice(
                    edit: PurchaseEdit(
                        editedAt: editedAt,
                        changes: [
                            PurchaseFieldChange(
                                field: .merchant, itemID: nil,
                                original: "Before", current: "After")
                        ]),
                    showOriginal: {})))

        #expect(!RenderedPixels.drawTheSame(empty, changed))
    }

    @Test("an added value omits the struck-through original row", .requiresCompiledColorCatalog)
    func addedValueOmitsOriginal() throws {
        let added = try #require(
            Self.render(
                PurchaseOriginalChangeRow(
                    value: PurchaseOriginalValue(
                        PurchaseFieldChange(
                            field: .lineAdded, itemID: "line",
                            original: nil, current: "Bread"),
                        lines: [
                            .init(
                                id: "line", name: "Bread", quantity: 1,
                                lineTotal: MoneyAmount(minorUnits: 500, currencyCode: "AUD"))
                        ]))))
        let replaced = try #require(
            Self.render(
                PurchaseOriginalChangeRow(
                    value: PurchaseOriginalValue(
                        PurchaseFieldChange(
                            field: .lineName, itemID: "line",
                            original: "BREAD", current: "Bread"),
                        lines: [
                            .init(
                                id: "line", name: "Bread", quantity: 1,
                                lineTotal: MoneyAmount(minorUnits: 500, currencyCode: "AUD"))
                        ]))))

        #expect(!RenderedPixels.drawTheSame(added, replaced))
    }

    private static func render(_ view: some View) -> Data? {
        let renderer = ImageRenderer(
            content:
                view
                .padding()
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
}
