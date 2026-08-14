import AppCore
import Foundation
import SwiftUI
import Testing

@testable import FeatureReceiptCapture
import DesignSystemTestSupport

/// The result card actually draws, and draws differently when the outcomes
/// it is supposed to distinguish differ.
///
/// Same technique and the same reasoning as `TransactionDetailRenderingTests`
/// next door: the `#Preview`s claim these render, Xcode's canvas is the only
/// place a person sees that, and nothing in CI opens it. This renders the
/// *card*, not the screen — the screen's root carries `.task`, which
/// `ImageRenderer` cannot see past.
@Suite("Receipt result rendering")
@MainActor
internal struct ReceiptResultRenderingTests {
    /// Tall enough for a `needsReview` card — the longest of the three — at
    /// iOS's default text size.
    private static let canvas = CGSize(width: 320, height: 900)

    private static let presentation = ReceiptResultPresentation()

    private static func card(_ outcome: ReceiptOutcome) -> some View {
        ReceiptResultCard(content: presentation.content(outcome))
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

    @Test("every card renders, and renders the same way twice")
    func rendersDeterministically() throws {
        let outcome = ReceiptOutcome.created(purchaseId: "purchase-1", alreadyStored: false)
        let once = try #require(Self.render(Self.card(outcome)))
        let again = try #require(Self.render(Self.card(outcome)))

        #expect(once == again)
    }

    /// The three outcomes must look distinct from one another, not merely say
    /// different words — a screen reader relies on the copy, but a sighted
    /// reader relies on this.
    @Test("the three outcomes do not look alike", .requiresCompiledColorCatalog)
    func theThreeOutcomesAreVisuallyDistinct() throws {
        let created = try #require(
            Self.render(Self.card(.created(purchaseId: "purchase-1", alreadyStored: false))))
        let needsReview = try #require(
            Self.render(
                Self.card(
                    .needsReview(receiptURIs: ["uri-1"], failures: [.fake()], extracted: .fake()))))
        let unreadable = try #require(
            Self.render(Self.card(.unreadable(receiptURIs: ["uri-1"], reason: "blank image"))))

        #expect(created != needsReview)
        #expect(created != unreadable)
        #expect(needsReview != unreadable)
    }

    /// A re-upload of the same bytes reads differently from a fresh write —
    /// the pair the copy layer is built to keep apart.
    @Test("a fresh write does not look like a re-upload", .requiresCompiledColorCatalog)
    func createdDistinguishesAlreadyStored() throws {
        let fresh = try #require(
            Self.render(Self.card(.created(purchaseId: "purchase-1", alreadyStored: false))))
        let repeated = try #require(
            Self.render(Self.card(.created(purchaseId: "purchase-1", alreadyStored: true))))

        #expect(fresh != repeated)
    }

    /// Every colour here is a token, and every token diverges between the two
    /// schemes.
    @Test("a card renders differently in light and dark", .requiresCompiledColorCatalog)
    func followsTheColourScheme() throws {
        let outcome = ReceiptOutcome.unreadable(receiptURIs: ["uri-1"], reason: "blank image")
        let light = try #require(Self.render(Self.card(outcome), in: .light))
        let dark = try #require(Self.render(Self.card(outcome), in: .dark))

        #expect(light != dark)
    }

    /// The gate-failure table and the extracted-fields table both have to
    /// reach the canvas. If a `needsReview` card with failures rendered
    /// identically to one without, the failure table would not be drawing.
    @Test("the gate failures reach the needs-review card", .requiresCompiledColorCatalog)
    func gateFailuresReachTheCanvas() throws {
        let withFailures = try #require(
            Self.render(
                Self.card(
                    .needsReview(
                        receiptURIs: [], failures: [.fake()],
                        extracted: .fake(lines: [], unreadableNotes: [])))))
        let withoutFailures = try #require(
            Self.render(
                Self.card(
                    .needsReview(
                        receiptURIs: [], failures: [],
                        extracted: .fake(lines: [], unreadableNotes: [])))))

        #expect(withFailures != withoutFailures)
    }

    /// The size the layout has to survive. iOS only, and the conditional is
    /// the honest kind: macOS has no Dynamic Type.
    #if os(iOS)
        @Test("a needs-review card still renders at the largest accessibility text size")
        func survivesAccessibilityTextSizes() throws {
            let outcome = ReceiptOutcome.needsReview(
                receiptURIs: ["uri-1"], failures: [.fake()], extracted: .fake())
            let stock = try #require(Self.render(Self.card(outcome)))
            let huge = try #require(
                Self.render(Self.card(outcome).dynamicTypeSize(.accessibility5)))

            #expect(stock != huge, "Dynamic Type is not reaching this card")
        }
    #endif
}
