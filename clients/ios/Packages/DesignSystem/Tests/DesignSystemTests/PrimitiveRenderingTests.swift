import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

/// The previews claim each primitive renders in both colour schemes. Xcode's
/// canvas is the only place a human sees that, and nothing in CI opens it — so
/// the same views are rasterised here instead. Two renders of the same view in
/// the same scheme must be byte-identical, which is what makes the light/dark
/// comparison meaningful rather than noise.
@Suite("Primitive rendering")
@MainActor
internal struct PrimitiveRenderingTests {
    private static let canvas = CGSize(width: 320, height: 240)

    internal static func render(_ view: some View, in scheme: ColorScheme) -> Data? {
        let renderer = ImageRenderer(
            content:
                view
                .environment(\.colorScheme, scheme)
                .frame(width: canvas.width, height: canvas.height)
                .background(Color.popsBackground.environment(\.colorScheme, scheme))
        )
        renderer.scale = 1
        guard let image = renderer.cgImage, let pixels = image.dataProvider?.data else {
            return nil
        }
        return pixels as Data
    }

    private static func check(_ view: some View, named name: String) throws {
        let light = try #require(render(view, in: .light), "\(name) failed to rasterise in light")
        let dark = try #require(render(view, in: .dark), "\(name) failed to rasterise in dark")
        let lightAgain = try #require(render(view, in: .light))

        #expect(
            light == lightAgain,
            "\(name) renders non-deterministically — the light/dark comparison below proves nothing"
        )
        #expect(light != dark, "\(name) renders identically in light and dark")
    }

    @Test("EmptyStateView", .requiresCompiledColorCatalog)
    func emptyState() throws {
        try Self.check(
            EmptyStateView(message: "No transactions in this period."), named: "EmptyStateView")
    }

    @Test("ErrorStateView", .requiresCompiledColorCatalog)
    func errorState() throws {
        try Self.check(
            ErrorStateView(message: "Could not reach the server.") {}, named: "ErrorStateView")
    }

    /// A different retry title is a different-width button, and a button
    /// changes width whether or not its label had a colour to be drawn in —
    /// which is why this one runs on the host lane rather than disabling
    /// itself there.
    @Test(
        "ErrorStateView renders a caller-supplied retryTitle",
        .comparisonSurvivesAnUncompiledCatalog)
    func errorStateCustomRetryTitle() throws {
        let stock = ErrorStateView(message: "boom") {}
        let custom = ErrorStateView(message: "boom", retryTitle: "Réessayer") {}

        let stockRender = try #require(Self.render(stock, in: .light))
        let customRender = try #require(Self.render(custom, in: .light))

        #expect(
            stockRender != customRender,
            "a custom retryTitle rendered identically to the default — the parameter is not reaching the button"
        )
    }

    // The blank-retryTitle fallback used to be proved here, by rendering the
    // screen with a blank title and with none and asserting the two images
    // matched. Equality between two renders is satisfied by two blank
    // canvases, so that assertion passed on the host lane whether or not the
    // fallback existed. It is `StatePrimitiveTests.blankCopyFallsBack` now,
    // asserted as copy, which needs no palette at all.

    @Test("PopsButton", .requiresCompiledColorCatalog)
    func button() throws {
        try Self.check(PopsButton("Pair") {}, named: "PopsButton")
    }

    /// The variant exists to be the one thing on a screen worth pressing. If
    /// it drew the same as the outline it would be a parameter nobody could
    /// see.
    ///
    /// It runs on the host lane too: the prominent variant also spans the
    /// available width, which is a difference in shape rather than in colour.
    @Test(
        "a prominent PopsButton does not draw like a standard one",
        .comparisonSurvivesAnUncompiledCatalog)
    func prominentButtonIsDistinct() throws {
        let standard = try #require(Self.render(PopsButton("Pair") {}, in: .light))
        let prominent = try #require(
            Self.render(PopsButton("Pair", prominence: .prominent) {}, in: .light))

        #expect(standard != prominent)
    }

    @Test("PopsButton — prominent", .requiresCompiledColorCatalog)
    func prominentButton() throws {
        try Self.check(
            PopsButton("Pair", prominence: .prominent) {}, named: "PopsButton(.prominent)")
    }

    @Test("PopsDivider", .requiresCompiledColorCatalog)
    func divider() throws {
        try Self.check(PopsDivider(), named: "PopsDivider")
    }

    @Test("PopsStatusHeader", .requiresCompiledColorCatalog)
    func statusHeader() throws {
        try Self.check(
            PopsStatusHeader(tone: .success, title: "Receipt saved", message: "Recorded."),
            named: "PopsStatusHeader")
    }

    /// The claim the whole primitive rests on: four tones are four different
    /// pictures, before any word is read.
    @Test("the four status tones do not look alike", .requiresCompiledColorCatalog)
    func statusTonesAreVisuallyDistinct() throws {
        let drawn = try PopsStatusHeader.Tone.allCases.map { tone in
            try #require(
                Self.render(
                    PopsStatusHeader(tone: tone, title: "Title", message: "Message."), in: .light))
        }

        #expect(Set(drawn).count == drawn.count)
    }

    @Test("PopsActionBar", .requiresCompiledColorCatalog)
    func actionBar() throws {
        try Self.check(
            PopsActionBar { PopsButton("Pair", prominence: .prominent) {} }, named: "PopsActionBar")
    }

    /// The placeholder is a drawn plate rather than a hole, so the empty state
    /// of a photograph is the same object at the same size as the photograph.
    @Test("PopsPhoto — placeholder", .requiresCompiledColorCatalog)
    func photoPlaceholder() throws {
        try Self.check(
            PopsPhoto(data: nil, placeholderSymbol: "doc.text.viewfinder")
                .frame(width: PopsSize.pageWidth, height: PopsSize.pageHeight),
            named: "PopsPhoto(placeholder)")
    }

    /// A picture reaches the plate rather than being swallowed by it. The one
    /// comparison here whose difference is the *image's* own colour rather
    /// than a token's, which is why it holds without a compiled palette.
    @Test(
        "PopsPhoto draws the bytes it was given, not the placeholder",
        .comparisonSurvivesAnUncompiledCatalog)
    func photoDrawsItsBytes() throws {
        let png = try #require(PopsTestImage.pngData(), "the fixture image could not be encoded")
        let plate = { (data: Data?) in
            PopsPhoto(data: data, placeholderSymbol: "doc.text.viewfinder")
                .frame(width: PopsSize.pageWidth, height: PopsSize.pageHeight)
        }

        let placeholder = try #require(Self.render(plate(nil), in: .light))
        let photograph = try #require(Self.render(plate(png), in: .light))

        #expect(placeholder != photograph)
    }

    @Test("PopsRow", .requiresCompiledColorCatalog)
    func row() throws {
        try Self.check(PopsRow(title: "Rent", subtitle: "1 August"), named: "PopsRow")
    }

    @Test("PopsCard", .requiresCompiledColorCatalog)
    func card() throws {
        try Self.check(
            PopsCard { PopsRow(title: "Groceries", subtitle: "12 transactions") }, named: "PopsCard"
        )
    }

    // LoadingStateView is excluded from the byte-comparison: `ProgressView`
    // animates, so two renders of it are not expected to match.
    @Test("LoadingStateView rasterises at all")
    func loadingState() throws {
        _ = try #require(Self.render(LoadingStateView(), in: .light))
        _ = try #require(Self.render(LoadingStateView(), in: .dark))
    }
}
