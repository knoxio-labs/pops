import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureEgo

@MainActor
@Suite("Ego conversation list model")
internal struct EgoConversationListModelTests {
    @Test("load keeps the repository's conversation order")
    func loadPreservesRepositoryOrder() async {
        let conversations = [conversation("first"), conversation("second")]
        let model = EgoConversationListModel(
            repository: ScriptedEgoRepository(conversations: conversations))

        await model.load()

        #expect(model.state == .loaded(conversations))
    }

    @Test("an empty unfiltered result is empty, not an error")
    func emptyUnfilteredResult() async {
        let model = EgoConversationListModel(repository: ScriptedEgoRepository())

        await model.load()

        #expect(model.state == .empty)
    }

    @Test("an empty search result remains a loaded search result")
    func emptySearchResult() async {
        let model = EgoConversationListModel(repository: ScriptedEgoRepository())

        await model.search("rent")

        #expect(model.state == .loaded([]))
    }

    @Test("search passes its query and page to the repository")
    func searchPassesQuery() async {
        let repository = ScriptedEgoRepository(conversations: [conversation("match")])
        let model = EgoConversationListModel(repository: repository)

        await model.search("rent")

        #expect(model.query == "rent")
        #expect(
            await repository.conversationQueries == [
                ScriptedEgoConversationQuery(limit: 50, offset: 0, query: "rent")
            ])
    }

    @Test("a blank search clears the repository query")
    func blankSearchPassesNil() async {
        let repository = ScriptedEgoRepository(conversations: [conversation("first")])
        let model = EgoConversationListModel(repository: repository)

        await model.search(" \n\t ")

        #expect(model.query == " \n\t ")
        #expect(await repository.conversationQueries.last?.query == nil)
    }

    @Test("a failed load becomes a failed state")
    func failedLoad() async {
        let repository = ScriptedEgoRepository(
            conversationResults: [.failure(.unauthorized)])
        let model = EgoConversationListModel(repository: repository)

        await model.load()

        #expect(model.state == .failed(.unauthorized))
    }

    @Test("repository failures use safe conversation-list copy")
    func failureMessages() {
        let cases: [(RepositoryError, String)] = [
            (.unavailable, "Ego is unavailable. Try again."),
            (.unauthorized, "Your session needs attention before Ego can continue."),
            (
                .rateLimited(retryAfterSeconds: 30),
                "Too many requests. Wait 30 seconds before trying again."
            ),
            (
                .rateLimited(retryAfterSeconds: nil),
                "Too many requests. Wait a minute before trying again."
            ),
            (.contractMismatch, "Ego returned a response this app can’t read."),
            (
                .conflict("duplicate"),
                "This conversation changed. Reload it before trying again."
            ),
            (.transport("network"), "Ego couldn’t complete the request. Try again."),
            (.dependencyNotBound, "Ego isn’t available in this app."),
        ]

        for (error, expected) in cases {
            #expect(EgoConversationListPresentation.failureMessage(for: error) == expected)
        }
    }

    @Test("a failed refresh preserves its last good rows")
    func failedRefreshPreservesRows() async {
        let conversations = [conversation("first")]
        let repository = ScriptedEgoRepository(
            conversations: conversations,
            conversationResults: [.success(conversations), .failure(.unavailable)])
        let model = EgoConversationListModel(repository: repository)
        await model.load()

        await model.refresh()

        #expect(model.state == .loaded(conversations))
    }

    @Test("refresh keeps the last good rows visible while the request is pending")
    func refreshPreservesRowsWhilePending() async {
        let conversations = [conversation("first")]
        let gate = EgoConversationListTestGate()
        let repository = ScriptedEgoRepository(
            conversations: conversations,
            conversationResults: [.success(conversations), .success(conversations)],
            conversationGate: { await gate.waitWhenBlocked() })
        let model = EgoConversationListModel(repository: repository)
        await model.load()
        await gate.block()

        let refresh = Task { await model.refresh() }
        await gate.waitUntilEntered()

        #expect(model.state == .loaded(conversations))
        await gate.release()
        await refresh.value
        #expect(model.state == .loaded(conversations))
    }

    @Test("a newer search result wins over an older request")
    func newerSearchWins() async {
        let first = conversation("first")
        let second = conversation("second")
        let gate = EgoConversationListTestGate()
        let repository = ScriptedEgoRepository(
            conversationResults: [.success([first]), .success([second])],
            conversationGate: { await gate.waitWhenBlocked() })
        let model = EgoConversationListModel(repository: repository)
        await gate.block()

        let olderSearch = Task { await model.search("old") }
        await gate.waitUntilEntered()
        await model.search("new")
        await gate.release()
        await olderSearch.value

        #expect(model.query == "new")
        #expect(model.state == .loaded([second]))
    }

    @Test("conversation titles use a fallback for nil or blank values")
    func titleFallback() {
        #expect(
            EgoConversationListPresentation.title(for: conversation("nil", title: nil))
                == "New conversation")
        #expect(
            EgoConversationListPresentation.title(for: conversation("blank", title: " \n "))
                == "New conversation")
        #expect(
            EgoConversationListPresentation.title(for: conversation("named", title: "Rent"))
                == "Rent")
    }

    private func conversation(_ id: String, title: String? = "Conversation") -> EgoConversation {
        let date = Date(timeIntervalSince1970: 1_800_000_000)
        return EgoConversation(id: id, title: title, createdAt: date, updatedAt: date)
    }
}

private actor EgoConversationListTestGate {
    private var isBlocked = false
    private var entered = false
    private var enteredContinuation: CheckedContinuation<Void, Never>?
    private var releaseContinuation: CheckedContinuation<Void, Never>?

    func block() {
        isBlocked = true
    }

    func waitWhenBlocked() async {
        guard isBlocked else { return }
        isBlocked = false
        await withCheckedContinuation { continuation in
            releaseContinuation = continuation
            entered = true
            enteredContinuation?.resume()
            enteredContinuation = nil
        }
    }

    func waitUntilEntered() async {
        if entered { return }
        await withCheckedContinuation { continuation in
            enteredContinuation = continuation
        }
    }

    func release() {
        isBlocked = false
        releaseContinuation?.resume()
        releaseContinuation = nil
    }
}
