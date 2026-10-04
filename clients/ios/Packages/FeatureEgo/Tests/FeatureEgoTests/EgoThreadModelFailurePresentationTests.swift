import Testing
@testable import FeatureEgo

@Suite("Ego thread model failure presentation")
internal struct EgoThreadModelFailurePresentationTests {
    @Test("unclassified failures remain retryable")
    func unclassifiedFailureIsRetryable() {
        let failure = EgoThreadModelFailurePresentation.failureCopy(
            for: UnclassifiedError.simulated)

        #expect(failure.message == "Ego couldn't complete the request. Try again.")
        #expect(failure.retryable)
    }
}

private enum UnclassifiedError: Error {
    case simulated
}
