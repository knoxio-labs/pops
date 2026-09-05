import AppCore
import DesignSystem
import FeatureReceiptCapture
import SwiftUI

/// A reading as a form: pre-filled, live from the first frame, and carrying
/// the gate's complaints as hints rather than locks.
///
/// `ReceiptDraftView` itself. Nothing in the shipped app opens it yet — this
/// package's README says why — which makes this catalogue entry the first
/// place it can be looked at as a real screen rather than read as source.
///
/// The ``correcting`` state is built from ``ReceiptPlaygroundFixtures/hardwareExtracted``
/// specifically because its failures split both ways: a negative line and an
/// ambiguous tax reading each name a field and surface as a hint beside it,
/// while a torn edge and an unrecognised gate code name nothing and surface
/// once, at the top, under "About the paper itself" — the two halves of the
/// design this form exists to carry.
@MainActor
internal enum ReceiptDraftSurfaces {
    private static let presentation = ReceiptDraftPresentation()

    internal static let surface = DesignSurface(
        id: SurfaceID(area: "receipts", slug: "draft"),
        title: "Receipt draft",
        synopsis: "A reading as a form somebody may change, pre-filled from what was read.",
        chrome: .tabbed,
        states: [
            DesignState.standard {
                ReceiptDraftView(
                    draft: presentation.draft(
                        extracted: ReceiptPlaygroundFixtures.tillNamesExtracted, failures: []),
                    title: ReceiptDraftCopy.title,
                    subtitle: ReceiptDraftCopy.subtitle,
                    parts: ReceiptPlaygroundPaper.pages(1),
                    secondaryAction: ReceiptDraftSurfaces.captureAnother,
                    save: { _ in })
            },
            DesignState("correcting", "Needs review, with hints") {
                ReceiptDraftView(
                    draft: presentation.draft(
                        extracted: ReceiptPlaygroundFixtures.hardwareExtracted,
                        failures: ReceiptPlaygroundFixtures.hardwareFailures),
                    title: ReceiptDraftCopy.title,
                    subtitle: ReceiptDraftCopy.subtitle,
                    status: ReceiptDraftView.Status(
                        tone: .warning,
                        heading: "Needs review",
                        message: "Some of what came back does not check out."),
                    parts: ReceiptPlaygroundPaper.pages(1),
                    secondaryAction: ReceiptDraftSurfaces.captureAnother,
                    save: { _ in })
            },
            DesignState("manual", "Nothing pre-filled") {
                ReceiptDraftView(
                    draft: presentation.blankDraft(currency: "AUD"),
                    title: ReceiptDraftCopy.manualTitle,
                    subtitle: ReceiptDraftCopy.manualSubtitle,
                    save: { _ in })
            },
        ]
    )

    /// The reconciliation withdrawing to "the figures have changed since they
    /// were checked" is not its own row: it is reached by editing any amount
    /// in ``standard`` or ``correcting`` above, in the real, live form — a
    /// fixture cannot pre-set it without reaching into `ReceiptDraft`'s
    /// internals, and the interaction it would be standing in for already
    /// works.
    private static let captureAnother = ReceiptDraftView.SecondaryAction(
        title: "Photograph another receipt", action: {})
}
