import DesignSystem
import SwiftUI

/// What the capture screen shows before there is a receipt: where you are,
/// what a good photograph looks like, what went wrong last time, and — when
/// the camera cannot be opened — why not.
///
/// The action itself is not here. It lives in the bar
/// ``ReceiptCaptureView`` pins under this, so the one thing this screen is
/// for stays reachable at the text sizes where the content is longest.
///
/// A view of its own rather than a section of ``ReceiptCaptureView`` for the
/// same reason `ReceiptResultCard` is one: the screen's root is a `ScrollView`,
/// and `ImageRenderer` lays a scroll view out but rasterises none of its
/// content — measured on both the host toolchain and the Simulator, where a
/// screenful of copy comes back as an empty canvas of the right height. So the
/// half that can be *seen* in a test is the half that has to be separable from
/// the scrolling.
internal struct ReceiptCapturePrompt: View {
    /// The plate is the same size as a captured page, so the empty state and
    /// the photograph that replaces it are one object at one size rather than
    /// two layouts that swap.
    @ScaledMetric(relativeTo: .body) private var pageWidth = PopsSize.pageWidth
    @ScaledMetric(relativeTo: .body) private var pageHeight = PopsSize.pageHeight

    internal let model: ReceiptCaptureViewModel

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xl) {
            header
            problemMessage
            refusal
            guidance
        }
    }

    /// The tab's name over a sentence saying what it does, with the plate a
    /// receipt will occupy beside them. An empty screen that shows the shape
    /// of what will fill it is a first-run experience; one that shows a
    /// button is a form.
    private var header: some View {
        HStack(alignment: .top, spacing: PopsSpacing.lg) {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Text(ReceiptCaptureCopy.title)
                    .font(.popsLargeTitle)
                    .foregroundStyle(Color.popsForeground)
                Text(ReceiptCaptureCopy.instruction)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            PopsPhoto(data: nil, placeholderSymbol: ReceiptCapturePrompt.emptyPlateSymbol)
                .frame(width: pageWidth, height: pageHeight)
                // Decoration: it stands for the receipt that is not there
                // yet, and announcing an empty plate tells a listener nothing
                // the sentence beside it has not already said.
                .accessibilityHidden(true)
        }
    }

    /// Why the last capture produced nothing. Toned rather than merely
    /// coloured: the glyph is what distinguishes this from the guidance card
    /// under it at a glance, and both are cards of text otherwise.
    @ViewBuilder private var problemMessage: some View {
        if let problem = model.problem {
            PopsCard {
                HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
                    Image(systemName: PopsStatusHeader.Tone.danger.symbolName)
                        .font(.popsBody)
                        .foregroundStyle(PopsStatusHeader.Tone.danger.color)
                        .accessibilityHidden(true)
                    Text(ReceiptCaptureCopy.message(for: problem))
                        .font(.popsBody)
                        .foregroundStyle(Color.popsForeground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier(ReceiptCaptureAccessibility.problem)
        }
    }

    /// Why there is no camera, when there is none. Which refusals earn the
    /// Settings link is ``CameraRefusal``'s decision, not this view's — and
    /// the link itself is in the action bar, because it is the action.
    @ViewBuilder private var refusal: some View {
        if let refusal = CameraRefusal.refusing(model.cameraAccess) {
            PopsStatusHeader(
                tone: refusal.tone, title: refusal.title, message: refusal.message
            )
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier(ReceiptCaptureAccessibility.cameraRefusal)
        }
    }

    /// What actually decides whether the reading comes back usable, said
    /// before the photograph rather than after it fails. Glyphs because this
    /// is a list somebody scans on the way to pressing the button, not one
    /// they read.
    private var guidance: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(ReceiptCaptureCopy.guidanceTitle)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            PopsCard {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    ForEach(ReceiptCapturePrompt.guidance, id: \.text) { hint in
                        hintRow(symbol: hint.symbol, text: hint.text)
                    }
                }
            }
        }
    }

    private func hintRow(symbol: String, text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
            Image(systemName: symbol)
                .font(.popsBody)
                .foregroundStyle(Color.popsAccent)
                .accessibilityHidden(true)
            Text(text)
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    /// What the empty plate stands for. The same glyph the app's own capture
    /// action uses, so the placeholder and the button say the same thing.
    private static let emptyPlateSymbol = "doc.text.viewfinder"

    /// The hints and their pictures. Here rather than in
    /// ``ReceiptCaptureCopy`` because a symbol name is not copy — nothing
    /// about it would be translated — but the pairing has to live somewhere
    /// one edit can keep straight.
    private static let guidance: [(symbol: String, text: String)] = [
        ("rectangle.dashed", ReceiptCaptureCopy.guidanceFlat),
        ("sun.max", ReceiptCaptureCopy.guidanceLight),
        ("rectangle.stack", ReceiptCaptureCopy.guidanceLongReceipt),
    ]
}
