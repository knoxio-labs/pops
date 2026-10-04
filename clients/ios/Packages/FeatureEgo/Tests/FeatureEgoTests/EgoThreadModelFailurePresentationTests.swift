import AppCore
import Testing
@testable import FeatureEgo

@Suite("Ego thread model failure presentation")
internal struct EgoThreadModelFailurePresentationTests {
    @Test("rate-limited failures remain retryable and show their wait")
    func rateLimitedFailureIsRetryable() {
        let failure = EgoThreadModelFailurePresentation.failureCopy(
            for: RepositoryError.rateLimited(retryAfterSeconds: 30))

        #expect(failure.message == "Too many requests. Wait 30 seconds before trying again.")
        #expect(failure.retryable)
    }

    @Test("rate-limited failures without a delay use the fallback wait")
    func rateLimitedFailureWithoutDelayIsRetryable() {
        let failure = EgoThreadModelFailurePresentation.failureCopy(
            for: RepositoryError.rateLimited(retryAfterSeconds: nil))

        #expect(failure.message == "Too many requests. Wait a minute before trying again.")
        #expect(failure.retryable)
    }
}
