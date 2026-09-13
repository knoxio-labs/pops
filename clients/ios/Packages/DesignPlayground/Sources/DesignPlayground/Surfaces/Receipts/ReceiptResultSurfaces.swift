import AppCore
import FeatureReceiptCapture

/// What reading an uploaded receipt came back as: an editable draft —
/// reconciled or not — nothing usable, a purchase saved, or the call never
/// landing at all.
///
/// `ReceiptResultView` itself, driven by a ``PlaygroundReceiptCaptureRepository``
/// that answers with whichever extraction, save result or ``RepositoryError``
/// a state names instead of reaching a BFM. Every usable reading is a
/// `.draft` (POPS-2454) — the states below exercise every
/// ``ReceiptGateFailureKind`` between them, not one row per kind, since the
/// screen draws the same warning-toned header regardless of which kind is in
/// the list.
@MainActor
internal enum ReceiptResultSurfaces {
    private static let receiptUris = [
        "pops://purchases/receipt/" + String(repeating: "a", count: 64)
    ]

    internal static let surface = DesignSurface(
        id: SurfaceID(area: "receipts", slug: "result"),
        title: "Receipt result",
        synopsis: "What reading an uploaded receipt came back as.",
        chrome: .tabbed,
        states: [
            DesignState.standard { ReceiptResultView(model: model(.success(.draft(tillNames)))) },
            DesignState("saved", "Saved") {
                ReceiptResultView(
                    model: model(
                        .success(.draft(tillNames)),
                        writing: .success(ReceiptPlaygroundFixtures.purchase)))
            },
            DesignState("needs-review", "Draft — unreconciled") {
                ReceiptResultView(
                    model: model(.success(.draft(typical)), pages: 2))
            },
            DesignState("needs-review-flagged", "Draft — damaged, unrecognised") {
                ReceiptResultView(model: model(.success(.draft(hardware))))
            },
            DesignState("needs-review-empty", "Draft — no lines read") {
                ReceiptResultView(model: model(.success(.draft(noLines))))
            },
            DesignState("unreadable", "Unreadable") {
                ReceiptResultView(
                    model: model(
                        .success(
                            .unreadable(
                                receiptCount: 1,
                                reason: ReceiptPlaygroundFixtures.unreadableReason))))
            },
            DesignState("manual-entry", "Manual entry") {
                ReceiptResultView(model: manualEntryModel())
            },
            DesignState("extracting", "Reading") {
                ReceiptResultView(model: model(.success(.draft(tillNames)), neverAnswers: true))
            },
            DesignState("gateway-failed", "Could not reach the server") {
                ReceiptResultView(model: model(.failure(.unavailable)))
            },
        ]
    )

    private static var tillNames: ReceiptDraftReading {
        ReceiptDraftReading(
            receiptUris: receiptUris, reconciled: true, failures: [],
            extracted: ReceiptPlaygroundFixtures.tillNamesExtracted, capture: nil)
    }

    private static var typical: ReceiptDraftReading {
        ReceiptDraftReading(
            receiptUris: receiptUris, reconciled: false,
            failures: ReceiptPlaygroundFixtures.typicalFailures,
            extracted: ReceiptPlaygroundFixtures.typicalExtracted, capture: nil)
    }

    private static var hardware: ReceiptDraftReading {
        ReceiptDraftReading(
            receiptUris: receiptUris, reconciled: false,
            failures: ReceiptPlaygroundFixtures.hardwareFailures,
            extracted: ReceiptPlaygroundFixtures.hardwareExtracted, capture: nil)
    }

    private static var noLines: ReceiptDraftReading {
        ReceiptDraftReading(
            receiptUris: receiptUris, reconciled: false,
            failures: ReceiptPlaygroundFixtures.noLinesFailures,
            extracted: ReceiptPlaygroundFixtures.noLinesExtracted, capture: nil)
    }

    private static func model(
        _ answer: Result<ReceiptExtraction, RepositoryError>,
        pages: Int = 1,
        writing writeAnswer: Result<ReceiptPurchase, RepositoryError> = .failure(.unavailable),
        neverAnswers: Bool = false
    ) -> ReceiptResultViewModel {
        ReceiptResultViewModel(
            parts: ReceiptPlaygroundPaper.pages(pages),
            dependencies: AppDependencies(
                transactions: AppDependencies.unbound.transactions,
                pairing: AppDependencies.unbound.pairing,
                reachability: AppDependencies.unbound.reachability,
                receiptCapture: PlaygroundReceiptCaptureRepository(
                    answer, writing: writeAnswer, neverAnswers: neverAnswers),
                purchases: AppDependencies.unbound.purchases,
                accounts: AppDependencies.unbound.accounts
            ))
    }

    private static func manualEntryModel() -> ReceiptResultViewModel {
        ReceiptResultViewModel(
            enteringManuallyWith: AppDependencies(
                transactions: AppDependencies.unbound.transactions,
                pairing: AppDependencies.unbound.pairing,
                reachability: AppDependencies.unbound.reachability,
                receiptCapture: PlaygroundReceiptCaptureRepository(
                    .failure(.unavailable), writing: .failure(.unavailable)),
                purchases: AppDependencies.unbound.purchases,
                accounts: AppDependencies.unbound.accounts
            ))
    }
}
