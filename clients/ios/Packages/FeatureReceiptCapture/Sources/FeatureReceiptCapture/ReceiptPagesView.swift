import AppCore
import DesignSystem
import SwiftUI

/// The photographs this receipt was sent as, drawn.
///
/// The single biggest thing this surface was missing. A receipts screen that
/// never shows a receipt is missing its most recognisable object — and the
/// object is what makes the reading underneath checkable: a reader comparing
/// "Milk 4.50" against a photograph of the paper is doing something a reader
/// looking at "Milk 4.50" alone cannot.
///
/// It draws above every outcome rather than inside any of them, because the
/// pages are the constant. What changes between `created`, `needsReview`,
/// `unreadable` and a gateway failure is the commentary; the paper is the
/// same paper, and moving it would make four screens out of one.
///
/// ## These are the bytes on the phone, not a stored receipt
///
/// The parts are what the camera produced and what was uploaded — held in
/// memory by the submission this screen is for. Nothing here fetches
/// anything. A receipt captured on another device, or on this one before the
/// app was relaunched, cannot be drawn until the BFM serves the stored bytes;
/// that is the surface a purchases list will read, and it is deliberately not
/// faked here with a placeholder that would imply the image is somewhere it is
/// not. This package's README says what that needs.
internal struct ReceiptPagesView: View {
    /// Scaled so the plate grows with the text rather than becoming a stamp
    /// beside it. `relativeTo: .body` because the caption under it is what
    /// the plate is sized against.
    @ScaledMetric(relativeTo: .body) private var pageWidth = PopsSize.pageWidth
    @ScaledMetric(relativeTo: .body) private var pageHeight = PopsSize.pageHeight

    internal let parts: [ReceiptPart]

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(ReceiptResultCopy.capturedPages)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            pages
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A horizontal scroll even for one page, so a receipt sent as one photo
    /// and a receipt sent as five are the same layout at the same size — the
    /// second is simply longer. A single page given the full width and
    /// several given a strip would be two designs, and the reader would meet
    /// whichever their shopping produced.
    private var pages: some View {
        ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: PopsSpacing.sm) {
                ForEach(Array(parts.enumerated()), id: \.offset) { index, part in
                    ReceiptPageView(part: part, index: index + 1, of: parts.count)
                        .frame(width: pageWidth, height: pageHeight)
                }
            }
        }
        // The strip is one thing to swipe through, not a row of stops.
        .scrollIndicators(.hidden)
    }
}

/// One captured page.
///
/// Its own view rather than the body of a `ForEach`, and for the reason this
/// package keeps splitting views out: `ImageRenderer` lays a `ScrollView` out
/// and rasterises none of its content, so anything drawn only inside the
/// strip above cannot be seen by a test at all. The plate can, and the plate
/// is where the claim worth making lives — that a photographed page draws its
/// own photograph.
internal struct ReceiptPageView: View {
    internal let part: ReceiptPart
    internal let index: Int
    internal let total: Int

    internal init(part: ReceiptPart, index: Int, of total: Int) {
        self.part = part
        self.index = index
        self.total = total
    }

    internal var body: some View {
        PopsPhoto(
            data: ReceiptPageMedia.imageData(of: part),
            placeholderSymbol: ReceiptPageMedia.placeholderSymbol(for: part)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ReceiptResultCopy.page(index, of: total))
    }
}

/// What a captured part is, and how to draw it when it is not a photograph.
///
/// Outside ``ReceiptPagesView`` because a `View` is main-actor isolated and
/// these are pure questions about a value — asking them from a test would
/// otherwise mean hopping actors for an answer that never touches a screen.
internal enum ReceiptPageMedia {
    /// The bytes, when they are a picture. A PDF invoice and a pasted body
    /// are receipts this contract accepts and neither is an image these
    /// decoders can draw, so both fall through to the plate's placeholder
    /// rather than to a broken-image glyph that would read as a failure.
    internal static func imageData(of part: ReceiptPart) -> Data? {
        switch part.mediaType {
        case .jpeg, .png, .webp, .gif:
            return part.data
        case .pdf, .plainText:
            return nil
        }
    }

    /// What a page that is not a drawable image is, said as a glyph. A
    /// document and a block of text are different things, and one generic
    /// icon for both tells the reader nothing about what they sent.
    internal static func placeholderSymbol(for part: ReceiptPart) -> String {
        switch part.mediaType {
        case .pdf:
            return "doc.richtext"
        case .plainText:
            return "text.alignleft"
        case .jpeg, .png, .webp, .gif:
            // Reached only when a photograph will not decode, which is a
            // capture that produced bytes but not a picture.
            return "photo"
        }
    }
}
