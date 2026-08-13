import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureReceiptCapture

/// What the result screen decides, against a fake and against a scripted
/// double.
///
/// The distinction every test here circles is the one the screen exists to
/// keep: three materially different outcomes, plus a call that never
/// answered with one at all. Only the last of those offers a retry that
/// resends the same bytes.
@MainActor
@Suite("Receipt result")
internal struct ReceiptResultViewModelTests {
    private static let parts = [ReceiptPart(mediaType: .jpeg, data: Data([0x01, 0x02]))]

    private func model(
        _ repository: any ReceiptCaptureRepository, parts: [ReceiptPart] = ReceiptResultViewModelTests.parts
    ) -> ReceiptResultViewModel {
        ReceiptResultViewModel(parts: parts, dependencies: .fake(receiptCapture: repository))
    }

    @Test("the screen opens submitting")
    func opensSubmitting() {
        let model = model(InMemoryReceiptCaptureRepository())

        #expect(model.state == .submitting)
    }

    @Test("a created outcome reaches the screen")
    func createdReachesTheScreen() async {
        let outcome = ReceiptOutcome.created(purchaseId: "purchase-1", alreadyStored: false)
        let repository = InMemoryReceiptCaptureRepository(defaultOutcome: outcome)
        let model = model(repository)

        await model.submit()

        #expect(model.state == .outcome(outcome))
    }

    @Test("a needs-review outcome reaches the screen with everything it carries")
    func needsReviewReachesTheScreen() async {
        let outcome = ReceiptOutcome.needsReview(
            receiptURIs: ["uri-1"], failures: [.fake()], extracted: .fake())
        let repository = InMemoryReceiptCaptureRepository(defaultOutcome: outcome)
        let model = model(repository)

        await model.submit()

        #expect(model.state == .outcome(outcome))
    }

    @Test("an unreadable outcome reaches the screen")
    func unreadableReachesTheScreen() async {
        let outcome = ReceiptOutcome.unreadable(receiptURIs: ["uri-1"], reason: "blank image")
        let repository = InMemoryReceiptCaptureRepository(defaultOutcome: outcome)
        let model = model(repository)

        await model.submit()

        #expect(model.state == .outcome(outcome))
    }

    @Test("the parts sent are exactly the parts given at construction")
    func sendsExactlyWhatItWasGiven() async {
        let repository = InMemoryReceiptCaptureRepository()
        let parts = [
            ReceiptPart(mediaType: .jpeg, data: Data([0x01])),
            ReceiptPart(mediaType: .png, data: Data([0x02])),
        ]
        let model = model(repository, parts: parts)

        await model.submit()

        #expect(await repository.received == [parts])
    }

    @Test("a gateway failure with nothing to show becomes the screen, and retries")
    func gatewayFailureThenRetry() async {
        let repository = InMemoryReceiptCaptureRepository()
        await repository.fail(onCall: 1, with: .unavailable)
        let model = model(repository)

        await model.submit()
        #expect(model.state == .failed(.unavailable))

        let outcome = ReceiptOutcome.created(purchaseId: "purchase-1", alreadyStored: false)
        await repository.respond(onCall: 2, with: outcome)
        await model.submit()

        #expect(model.state == .outcome(outcome))
        #expect(await repository.callCount == 2)
    }

    /// An outcome is an answer, including a `needsReview` or `unreadable` one
    /// — neither is a failure, and neither should resend the same bytes on a
    /// re-appearance.
    @Test("an outcome that has landed is not resubmitted")
    func doesNotResubmitAnOutcome() async {
        let repository = InMemoryReceiptCaptureRepository(
            defaultOutcome: .unreadable(receiptURIs: [], reason: "blank"))
        let model = model(repository)

        await model.submit()
        await model.submit()

        #expect(await repository.callCount == 1)
    }

    /// Two `.task` invocations before the first answers — the same race
    /// `TransactionDetailViewModelTests` guards against, here guarding
    /// against submitting a receipt's bytes twice.
    @Test("two submissions racing produce one request")
    func submitIsNotReentrant() async {
        let repository = ScriptedReceiptCaptureRepository(
            script: [.outcome(.unreadable(receiptURIs: [], reason: "blank"))],
            gating: [1]
        )
        let model = model(repository)

        let first = Task { await model.submit() }
        await repository.waitUntilCalled(1)
        let second = Task { await model.submit() }

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

        await model.submit()

        guard case .failed(.transport) = model.state else {
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

        await model.submit()

        #expect(model.state == .failed(.dependencyNotBound))
    }
}
