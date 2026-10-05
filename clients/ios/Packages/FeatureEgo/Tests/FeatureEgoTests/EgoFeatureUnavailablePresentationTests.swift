import AppCore
import Testing

@testable import FeatureEgo

@Suite("Ego feature unavailable presentation")
internal struct EgoFeatureUnavailablePresentationTests {
    @Test("conversation list explains a missing Ego capability")
    func listFeatureUnavailableCopy() {
        #expect(
            EgoConversationListPresentation.failureMessage(for: .featureUnavailable)
                == "This phone isn't allowed to use Ego.")
    }

    @Test("conversation list does not offer retry for a missing Ego capability")
    func listFeatureUnavailableIsNotRetryable() {
        #expect(!EgoConversationListPresentation.failureIsRetryable(for: .featureUnavailable))
    }

    @Test("thread failure explains and does not retry a missing Ego capability")
    func threadFeatureUnavailableIsNotRetryable() {
        let failure = EgoThreadModelFailurePresentation.failureCopy(
            for: RepositoryError.featureUnavailable)

        #expect(failure.message == "This phone isn't allowed to use Ego.")
        #expect(!failure.retryable)
    }

    @Test("credential refusal retains the distinct session-attention copy")
    func unauthorizedStillMeansSessionAttention() {
        let failure = EgoThreadModelFailurePresentation.failureCopy(
            for: RepositoryError.unauthorized)

        #expect(
            failure.message == "Your session needs attention before Ego can continue.")
        #expect(!failure.retryable)
        #expect(
            EgoConversationListPresentation.failureMessage(for: .unauthorized)
                == "Your session needs attention before Ego can continue.")
    }
}
