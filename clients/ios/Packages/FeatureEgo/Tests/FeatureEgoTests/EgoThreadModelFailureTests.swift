import AppCore
import AppCoreFakes
import Testing

@testable import FeatureEgo

private struct ExpectedEgoThreadFailure {
    let error: RepositoryError
    let message: String
    let retryable: Bool
}

private enum EgoThreadModelFailureFixtures {
    private static let structuredTransport = PopsError(
        code: "test.transport", message: "private transport detail", retryable: false,
        kind: .server)

    static let mappedErrors: [ExpectedEgoThreadFailure] = [
        ExpectedEgoThreadFailure(
            error: .unauthorized,
            message: "Your session needs attention before Ego can continue.", retryable: false),
        ExpectedEgoThreadFailure(
            error: .rateLimited(retryAfterSeconds: 30),
            message: "Too many requests. Wait 30 seconds before trying again.", retryable: true),
        ExpectedEgoThreadFailure(
            error: .rateLimited(retryAfterSeconds: nil),
            message: "Too many requests. Wait a minute before trying again.", retryable: true),
        ExpectedEgoThreadFailure(
            error: .contractMismatch,
            message: "Ego returned a response this app can't read.", retryable: false),
        ExpectedEgoThreadFailure(
            error: .conflict("duplicate"),
            message: "This conversation changed. Reload it before trying again.",
            retryable: false),
        ExpectedEgoThreadFailure(
            error: .transport("legacy network error"),
            message: "Ego couldn't complete the request. Try again.", retryable: true),
        ExpectedEgoThreadFailure(
            error: .transport(structuredTransport),
            message: "Ego couldn't complete the request. Try again.", retryable: false),
        ExpectedEgoThreadFailure(
            error: .dependencyNotBound, message: "Ego isn't available in this app.",
            retryable: false),
    ]
}

@MainActor
@Suite("Ego thread model failures")
internal struct EgoThreadModelFailureTests {
    @Test("repository failures map to safe copy and retryability")
    func mapsRepositoryFailures() async {
        for failure in EgoThreadModelFailureFixtures.mappedErrors {
            let repository = ScriptedEgoRepository(
                chatScripts: [
                    ScriptedEgoChatScript(events: [], trailingError: failure.error)
                ])
            let model = EgoThreadModelFixtures.model(repository: repository)
            model.draft = "question"

            model.send()
            await awaitObservedCondition {
                guard let phase = model.turn?.phase else { return false }
                if case .failed = phase { return true }
                return false
            }

            #expect(
                model.turn?.phase
                    == .failed(message: failure.message, retryable: failure.retryable))
        }
    }

    @Test("retry ignores a non-retryable failure")
    func doesNotRetryNonRetryableFailure() async {
        let repository = ScriptedEgoRepository(
            chatScripts: [
                ScriptedEgoChatScript(events: [], trailingError: RepositoryError.unauthorized)
            ])
        let model = EgoThreadModelFixtures.model(repository: repository)
        model.draft = "question"

        model.send()
        await awaitObservedCondition {
            guard let phase = model.turn?.phase else { return false }
            if case .failed = phase { return true }
            return false
        }
        model.retry()

        #expect(
            model.turn?.phase
                == .failed(
                    message: "Your session needs attention before Ego can continue.",
                    retryable: false))
        #expect(await repository.streamChatCalls.count == 1)
        #expect(model.messages.filter { $0.role == .user }.count == 1)
    }
}
