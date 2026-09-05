import AppCore
import FeatureReceiptCapture
import SwiftUI

/// What reading an uploaded receipt came back as: a purchase, a reading
/// waiting on a person, nothing usable, or the upload never landing at all.
///
/// `ReceiptResultView` itself, driven by a ``PlaygroundReceiptCaptureRepository``
/// that answers with whichever outcome or ``RepositoryError`` a state names
/// instead of reaching a BFM. The three ``needsReview`` states between them
/// exercise all eight ``ReceiptGateFailureKind`` cases — not one row per kind,
/// since the screen draws the same warning-toned card regardless of which
/// kind is in the list, but every kind still has to appear somewhere or a gap
/// in ``ReceiptResultPresentation``'s wording would have nothing to show it.
@MainActor
internal enum ReceiptResultSurfaces {
    internal static let surface = DesignSurface(
        id: SurfaceID(area: "receipts", slug: "result"),
        title: "Receipt result",
        synopsis: "What reading an uploaded receipt came back as.",
        chrome: .tabbed,
        states: [
            DesignState.standard { ReceiptResultView(model: model(.success(created))) },
            DesignState("already-stored", "Already on file") {
                ReceiptResultView(model: model(.success(alreadyStoredCreated)))
            },
            DesignState("needs-review", "Needs review") {
                ReceiptResultView(
                    model: model(
                        .success(
                            .needsReview(
                                receiptCount: 2,
                                failures: ReceiptPlaygroundFixtures.typicalFailures,
                                extracted: ReceiptPlaygroundFixtures.typicalExtracted)),
                        pages: 2))
            },
            DesignState("needs-review-flagged", "Needs review — damaged, unrecognised") {
                ReceiptResultView(
                    model: model(
                        .success(
                            .needsReview(
                                receiptCount: 1,
                                failures: ReceiptPlaygroundFixtures.hardwareFailures,
                                extracted: ReceiptPlaygroundFixtures.hardwareExtracted))))
            },
            DesignState("needs-review-empty", "Needs review — no lines read") {
                ReceiptResultView(
                    model: model(
                        .success(
                            .needsReview(
                                receiptCount: 1,
                                failures: ReceiptPlaygroundFixtures.noLinesFailures,
                                extracted: ReceiptPlaygroundFixtures.noLinesExtracted))))
            },
            DesignState("unreadable", "Unreadable") {
                ReceiptResultView(
                    model: model(
                        .success(
                            .unreadable(
                                receiptCount: 1,
                                reason: ReceiptPlaygroundFixtures.unreadableReason))))
            },
            DesignState("submitting", "Reading") {
                ReceiptResultView(model: model(.success(created), neverAnswers: true))
            },
            DesignState("gateway-failed", "Could not reach the server") {
                ReceiptResultView(model: model(.failure(.unavailable)))
            },
        ]
    )

    private static var created: ReceiptOutcome {
        .created(purchase: ReceiptPlaygroundFixtures.purchase, alreadyStored: false)
    }

    private static var alreadyStoredCreated: ReceiptOutcome {
        .created(purchase: ReceiptPlaygroundFixtures.purchase, alreadyStored: true)
    }

    private static func model(
        _ answer: Result<ReceiptOutcome, RepositoryError>,
        pages: Int = 1,
        neverAnswers: Bool = false
    ) -> ReceiptResultViewModel {
        ReceiptResultViewModel(
            parts: ReceiptPlaygroundPaper.pages(pages),
            dependencies: AppDependencies(
                transactions: AppDependencies.unbound.transactions,
                pairing: AppDependencies.unbound.pairing,
                reachability: AppDependencies.unbound.reachability,
                receiptCapture: PlaygroundReceiptCaptureRepository(
                    answer, neverAnswers: neverAnswers),
                purchases: AppDependencies.unbound.purchases,
                accounts: AppDependencies.unbound.accounts
            ))
    }
}
