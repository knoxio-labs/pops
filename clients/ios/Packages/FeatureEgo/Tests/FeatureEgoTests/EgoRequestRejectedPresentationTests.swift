import AppCore
import Testing

@testable import FeatureEgo

@Suite("Ego request rejected presentation")
internal struct EgoRequestRejectedPresentationTests {
    @Test("conversation list asks for an app update")
    func conversationListExplainsRequestRejection() {
        let message = EgoConversationListPresentation.failureMessage(for: .requestRejected)

        #expect(
            message
                == "This version of Pops sent a request the server cannot accept. Update the app.")
    }

    @Test("conversation list request rejection does not offer retry")
    func conversationListRequestRejectionIsNotRetryable() {
        #expect(!EgoConversationListPresentation.failureIsRetryable(for: .requestRejected))
    }

    @Test("conversation list keeps retry for transient unavailability")
    func conversationListUnavailableRemainsRetryable() {
        #expect(EgoConversationListPresentation.failureIsRetryable(for: .unavailable))
    }

    @Test("thread request rejection is not retryable")
    func threadRequestRejectionIsNotRetryable() {
        let failure = EgoThreadModelFailurePresentation.failureCopy(
            for: RepositoryError.requestRejected)

        #expect(
            failure.message
                == "This version of Pops sent a request the server cannot accept. Update the app.")
        #expect(!failure.retryable)
    }
}
