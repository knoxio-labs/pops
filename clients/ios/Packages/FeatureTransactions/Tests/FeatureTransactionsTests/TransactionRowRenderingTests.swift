import AppCore
import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import FeatureTransactions

/// The row actually draws, and draws differently when the things it is supposed
/// to distinguish differ.
///
/// Same technique and the same reasoning as `DesignSystem`'s
/// `PrimitiveRenderingTests`: the `#Preview`s claim these render, Xcode's canvas
/// is the only place a person sees that, and nothing in CI opens it. Two renders
/// of the same row in the same scheme must be byte-identical, which is what
/// makes every comparison below a signal rather than noise.
@Suite("Transaction row rendering")
@MainActor
internal struct TransactionRowRenderingTests {
    private static let canvas = CGSize(width: 320, height: 120)

    private static let presentation = TransactionPresentation(
        locale: Locale(identifier: "en_AU"),
        timeZone: TimeZone(identifier: "Australia/Sydney") ?? .gmt
    )

    private static func row(_ transaction: AppCore.Transaction) -> some View {
        TransactionRowView(transaction: transaction, presentation: presentation)
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

    private static func transaction(
        minorUnits: Int = -540,
        entityName: String? = "Sample Coffee",
        tags: [String] = ["coffee"]
    ) -> AppCore.Transaction {
        AppCore.Transaction(
            id: "txn-1",
            description: "Flat white",
            amount: MoneyAmount(minorUnits: minorUnits, currencyCode: "AUD"),
            date: Date(timeIntervalSince1970: 0),
            type: .purchase,
            entityName: entityName,
            tags: tags
        )
    }

    @Test("a row renders, and renders the same way twice")
    func rowRendersDeterministically() throws {
        let once = try #require(Self.render(Self.row(Self.transaction())))
        let again = try #require(Self.render(Self.row(Self.transaction())))

        #expect(once == again)
    }

    /// Every colour on this row is a token, and every token diverges between the
    /// two schemes. A row that rendered identically in both would be one whose
    /// colours are coming from somewhere other than the catalogue.
    @Test("a row renders differently in light and dark", .requiresCompiledColorCatalog)
    func rowFollowsTheColourScheme() throws {
        let light = try #require(Self.render(Self.row(Self.transaction()), in: .light))
        let dark = try #require(Self.render(Self.row(Self.transaction()), in: .dark))

        #expect(light != dark)
    }

    /// Money arriving is the one thing this list colours. If these rendered
    /// alike, the credit token would not be reaching the amount.
    @Test("a credit does not look like a debit", .requiresCompiledColorCatalog)
    func creditsAreDistinguishable() throws {
        let credit = try #require(Self.render(Self.row(Self.transaction(minorUnits: 540))))
        let debit = try #require(Self.render(Self.row(Self.transaction(minorUnits: -540))))

        #expect(credit != debit)
    }

    /// The layout has to survive the largest text the system offers — that is
    /// the size at which a fixed point size or a fixed frame stops fitting, and
    /// the whole reason this package names neither.
    ///
    /// iOS only, and the conditional is the honest kind rather than a
    /// convenience: macOS has no Dynamic Type, so `dynamicTypeSize` changes
    /// nothing there and the assertion would be measuring the platform rather
    /// than the row. `mise run test` runs this package against the iOS SDK on a
    /// simulator, which is where it means something; `swift test` on the host
    /// does not compile it at all rather than skipping it, so it cannot report
    /// a pass it never made.
    #if os(iOS)
        @Test("a row still renders at the largest accessibility text size")
        func rowSurvivesAccessibilityTextSizes() throws {
            let stock = try #require(Self.render(Self.row(Self.transaction())))
            let huge = try #require(
                Self.render(Self.row(Self.transaction()).dynamicTypeSize(.accessibility5)))

            #expect(stock != huge, "Dynamic Type is not reaching this row")
        }
    #endif
}
