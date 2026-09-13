import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureReceiptCapture

/// What the result screen decides, against a fake and against a scripted
/// double.
///
/// Extraction and persistence are two different calls now (POPS-2454): a
/// usable reading — reconciled or not — is a `.draft` a reader edits, never
/// a terminal state on its own, and only `save(_:)` reaching `.saved` means
/// anything was written.
@MainActor
@Suite("Receipt result")
internal struct ReceiptResultViewModelTests {
    private static let parts = [ReceiptPart(mediaType: .jpeg, data: Data([0x01, 0x02]))]

    private static let reading = ReceiptDraftReading(
        receiptUris: ["pops://purchases/receipt/" + String(repeating: "a", count: 64)],
        reconciled: true,
        failures: [],
        extracted: .fake(),
        capture: nil
    )

    private func model(
        _ repository: any ReceiptCaptureRepository,
        parts: [ReceiptPart] = ReceiptResultViewModelTests.parts
    ) -> ReceiptResultViewModel {
        ReceiptResultViewModel(parts: parts, dependencies: .fake(receiptCapture: repository))
    }

    @Test("the screen opens extracting")
    func opensExtracting() {
        let model = model(InMemoryReceiptCaptureRepository())

        #expect(model.state == .extracting)
    }

    @Test("a reconciled draft reaches the screen")
    func draftReachesTheScreen() async {
        let repository = InMemoryReceiptCaptureRepository(
            defaultExtraction: .draft(Self.reading))
        let model = model(repository)

        await model.extract()

        #expect(model.state == .draft(Self.reading))
    }

    @Test("an unreconciled draft reaches the screen carrying its failures")
    func unreconciledDraftReachesTheScreen() async {
        let reading = ReceiptDraftReading(
            receiptUris: Self.reading.receiptUris, reconciled: false, failures: [.fake()],
            extracted: .fake(), capture: nil)
        let repository = InMemoryReceiptCaptureRepository(defaultExtraction: .draft(reading))
        let model = model(repository)

        await model.extract()

        #expect(model.state == .draft(reading))
    }

    @Test("an unreadable outcome reaches the screen")
    func unreadableReachesTheScreen() async {
        let extraction = ReceiptExtraction.unreadable(receiptCount: 1, reason: "blank image")
        let repository = InMemoryReceiptCaptureRepository(defaultExtraction: extraction)
        let model = model(repository)

        await model.extract()

        #expect(model.state == .unreadable(receiptCount: 1, reason: "blank image"))
    }

    @Test("the parts sent are exactly the parts given at construction")
    func sendsExactlyWhatItWasGiven() async {
        let repository = InMemoryReceiptCaptureRepository()
        let parts = [
            ReceiptPart(mediaType: .jpeg, data: Data([0x01])),
            ReceiptPart(mediaType: .png, data: Data([0x02])),
        ]
        let model = model(repository, parts: parts)

        await model.extract()

        #expect(await repository.extracted == [parts])
    }

    @Test("a gateway failure with nothing to show becomes the screen, and retries")
    func gatewayFailureThenRetry() async {
        let repository = InMemoryReceiptCaptureRepository()
        await repository.failExtract(onCall: 1, with: .unavailable)
        let model = model(repository)

        await model.extract()
        #expect(model.state == .extractionFailed(.unavailable))

        await repository.respond(onCall: 2, with: .draft(Self.reading))
        await model.extract()

        #expect(model.state == .draft(Self.reading))
        #expect(await repository.extractCallCount == 2)
    }

    /// A draft is an answer, and so is `unreadable` — neither should resend
    /// the same bytes on a re-appearance.
    @Test("a reading that has landed is not re-extracted")
    func doesNotReExtract() async {
        let repository = InMemoryReceiptCaptureRepository(
            defaultExtraction: .unreadable(receiptCount: 0, reason: "blank"))
        let model = model(repository)

        await model.extract()
        await model.extract()

        #expect(await repository.extractCallCount == 1)
    }

    /// Two `.task` invocations before the first answers — the same race
    /// `TransactionDetailViewModelTests` guards against, here guarding
    /// against extracting a receipt's bytes twice.
    @Test("two extractions racing produce one request")
    func extractIsNotReentrant() async {
        let repository = ScriptedReceiptCaptureRepository(
            script: [.outcome(.unreadable(receiptCount: 0, reason: "blank"))],
            gating: [1]
        )
        let model = model(repository)

        let first = Task { await model.extract() }
        await repository.waitUntilCalled(1)
        let second = Task { await model.extract() }

        await repository.release()
        await first.value
        await second.value

        #expect(await repository.callCount == 1)
    }

    /// The repository protocol does not constrain what it throws, so anything
    /// a layer below raises has to land somewhere a screen can act on rather
    /// than escaping as an unhandled type.
    @Test("something this app has never heard of becomes a transport failure")
    func unrecognisedFailuresAreDescribed() async {
        let repository = ScriptedReceiptCaptureRepository(
            script: [.failing(UnrecognisedRepositoryFailure())])
        let model = model(repository)

        await model.extract()

        guard case .extractionFailed(.transport) = model.state else {
            Issue.record("expected a transport failure, got \(model.state)")
            return
        }
    }

    /// A dependency nobody bound has to reach a screen as a state rather than
    /// as a crash on somebody's phone — the same guarantee
    /// `TransactionDetailViewModelTests` pins for the transactions seam.
    @Test("an unbound repository is a failure state, not a trap")
    func unboundDependencyIsAState() async {
        let model = ReceiptResultViewModel(parts: Self.parts, dependencies: .unbound)

        await model.extract()

        #expect(model.state == .extractionFailed(.dependencyNotBound))
    }

    // MARK: save

    @Test("saving a draft persists it and moves the screen to saved")
    func saveMovesToSaved() async throws {
        let repository = InMemoryReceiptCaptureRepository(defaultExtraction: .draft(Self.reading))
        await repository.respondToSave(with: .success(.fake(id: "purchase-1")))
        let model = model(repository)
        await model.extract()

        let draft = ReceiptDraftPresentation().draft(extracted: .fake(), failures: [])
        await model.save(draft)

        #expect(model.state == .saved(.fake(id: "purchase-1")))
        #expect(await repository.savedDrafts.count == 1)
    }

    @Test("a save that is not confirmed by a landed draft does nothing")
    func saveWithoutADraftDoesNothing() async {
        let repository = InMemoryReceiptCaptureRepository()
        let model = model(repository)

        let draft = ReceiptDraftPresentation().draft(extracted: .fake(), failures: [])
        await model.save(draft)

        #expect(await repository.savedDrafts.isEmpty)
    }

    @Test("a save failure is reported without discarding the draft")
    func saveFailureIsReported() async {
        let repository = InMemoryReceiptCaptureRepository(defaultExtraction: .draft(Self.reading))
        await repository.respondToSave(with: .failure(.unavailable))
        let model = model(repository)
        await model.extract()

        let draft = ReceiptDraftPresentation().draft(extracted: .fake(), failures: [])
        await model.save(draft)

        #expect(model.saveError == .unavailable)
        // The screen stays on the draft — a failed save must not discard it.
        #expect(model.state == .draft(Self.reading))
    }

    @Test("dismissing a save error clears it without touching the draft")
    func dismissSaveError() async {
        let repository = InMemoryReceiptCaptureRepository(defaultExtraction: .draft(Self.reading))
        await repository.respondToSave(with: .failure(.unavailable))
        let model = model(repository)
        await model.extract()
        await model.save(ReceiptDraftPresentation().draft(extracted: .fake(), failures: []))

        model.dismissSaveError()

        #expect(model.saveError == nil)
        #expect(model.state == .draft(Self.reading))
    }

    @Test("an amount that will not parse is reported as a validation failure, not sent")
    func unparseableAmountIsNotSent() async {
        let repository = InMemoryReceiptCaptureRepository(defaultExtraction: .draft(Self.reading))
        let model = model(repository)
        await model.extract()

        await model.save(
            ReceiptDraftPresentation().draft(extracted: .fake(total: "abc"), failures: []))

        #expect(model.saveValidationError == .unparseableAmount)
        #expect(await repository.savedDrafts.isEmpty)
    }
}
