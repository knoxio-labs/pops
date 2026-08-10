import AppCore
import AppCoreFakes
import Foundation
import SwiftUI
import Testing

@testable import FeatureTransactions

/// The detail screen actually draws, and draws differently when the things it
/// is supposed to distinguish differ.
///
/// Same technique and the same reasoning as `TransactionRowRenderingTests`
/// next door: the `#Preview`s claim these render, Xcode's canvas is the only
/// place a person sees that, and nothing in CI opens it.
///
/// This renders the *card* the screen is made of rather than the screen — the
/// root carries `.task` and `.onChange`, and `ImageRenderer` cannot see past
/// either. That limit is measured, not assumed; see this package's README.
@Suite("Transaction detail rendering")
@MainActor
internal struct TransactionDetailRenderingTests {
    private static let canvas = CGSize(width: 320, height: 420)

    private static let presentation = TransactionDetailPresentation(
        locale: Locale(identifier: "en_AU"),
        timeZone: TimeZone(identifier: "Australia/Sydney") ?? .gmt
    )

    private static func card(_ detail: TransactionDetail) -> some View {
        TransactionDetailCard(content: presentation.content(detail))
    }

    private static func render(_ view: some View, in scheme: ColorScheme = .light) -> Data? {
        let renderer = ImageRenderer(
            content:
                view
                .environment(\.colorScheme, scheme)
                .frame(width: canvas.width, height: canvas.height)
        )
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }

    @Test("the record renders, and renders the same way twice")
    func rendersDeterministically() throws {
        let once = try #require(Self.render(Self.card(TransactionDetail.fake())))
        let again = try #require(Self.render(Self.card(TransactionDetail.fake())))

        #expect(once == again)
    }

    /// Every colour here is a token, and every token diverges between the two
    /// schemes. Rendering identically in both would mean the colours are coming
    /// from somewhere other than the catalogue.
    @Test("the record renders differently in light and dark")
    func followsTheColourScheme() throws {
        let light = try #require(Self.render(Self.card(TransactionDetail.fake()), in: .light))
        let dark = try #require(Self.render(Self.card(TransactionDetail.fake()), in: .dark))

        #expect(light != dark)
    }

    /// Money arriving is the one thing this app colours. If these rendered
    /// alike the credit token would not be reaching the amount.
    @Test("a credit does not look like a debit")
    func creditsAreDistinguishable() throws {
        let credit = MoneyAmount(minorUnits: 540, currencyCode: "AUD")
        let debit = MoneyAmount(minorUnits: -540, currencyCode: "AUD")

        let arriving = try #require(Self.render(Self.card(TransactionDetail.fake(amount: credit))))
        let leaving = try #require(Self.render(Self.card(TransactionDetail.fake(amount: debit))))

        #expect(arriving != leaving)
    }

    /// The seeded shape and the filled-in one are the same layout with more
    /// lines in it. If they rendered alike, the fields that only the record
    /// carries would not be reaching the screen at all.
    @Test("a seeded row does not look like the full record")
    func seededDiffersFromLoaded() throws {
        let seeded = TransactionDetailCard(
            content: Self.presentation.content(Transaction.fake(entityName: "Sample", tags: ["a"])))
        let loaded = Self.card(TransactionDetail.fake())

        #expect(try #require(Self.render(seeded)) != #require(Self.render(loaded)))
    }

    /// The size the layout has to survive. iOS only, and the conditional is the
    /// honest kind: macOS has no Dynamic Type, so the assertion would be
    /// measuring the platform rather than the screen. Compiled out on the host
    /// rather than skipped, so it cannot report a pass it never made.
    #if os(iOS)
        @Test("the record still renders at the largest accessibility text size")
        func survivesAccessibilityTextSizes() throws {
            let stock = try #require(Self.render(Self.card(TransactionDetail.fake())))
            let huge = try #require(
                Self.render(Self.card(TransactionDetail.fake()).dynamicTypeSize(.accessibility5)))

            #expect(stock != huge, "Dynamic Type is not reaching this screen")
        }
    #endif
}
