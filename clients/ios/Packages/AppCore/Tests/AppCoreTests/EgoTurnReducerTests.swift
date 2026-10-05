import AppCore
import Testing

@Suite("Ego turn reducer")
internal struct EgoTurnReducerTests {
    @Test("tokens concatenate in arrival order")
    func concatenatesTokens() {
        let state = reduce([
            .token("Hello"),
            .token(", "),
            .token("world."),
        ])

        #expect(state.streamedText == "Hello, world.")
    }

    @Test("same-name tool calls resolve independently in arrival order")
    func resolvesSequentialToolCalls() {
        let state = reduce([
            .tool(name: "inventory.search", status: .started),
            .tool(name: "inventory.search", status: .finished),
            .tool(name: "inventory.search", status: .started),
            .tool(name: "inventory.search", status: .failed),
        ])

        #expect(
            state.tools == [
                EgoToolActivity(id: 0, name: "inventory.search", status: .finished),
                EgoToolActivity(id: 1, name: "inventory.search", status: .failed),
            ])
    }

    @Test("a tool completion without a matching start is recorded as resolved")
    func recordsUnstartedCompletion() {
        let state = reduce([.tool(name: "media.search", status: .finished)])

        #expect(state.tools == [EgoToolActivity(id: 0, name: "media.search", status: .finished)])
    }

    @Test("done replaces streamed parts, clears token text, and keeps other activity")
    func doneIsAuthoritative() {
        let finalParts: [EgoMessagePart] = [.text("Persisted answer")]
        let state = reduce([
            .token("Partial answer"),
            .part(.text("Provisional part")),
            .tool(name: "inventory.search", status: .started),
            .navigate(uri: "pops:inventory/item/18"),
            .done(conversationId: "conversation-1", messageId: "message-1", parts: finalParts),
        ])

        #expect(state.streamedText.isEmpty)
        #expect(state.parts == finalParts)
        #expect(state.tools == [EgoToolActivity(id: 0, name: "inventory.search", status: .started)])
        #expect(state.navigationTarget == "pops:inventory/item/18")
        #expect(state.phase == .finished(conversationId: "conversation-1", messageId: "message-1"))
    }

    @Test("failed keeps the partial text and parts")
    func failureKeepsPartialState() {
        let state = reduce([
            .token("First "),
            .token("half"),
            .part(.text("A card already arrived")),
            .failed(message: "Connection lost", retryable: true),
        ])

        #expect(state.streamedText == "First half")
        #expect(state.parts == [.text("A card already arrived")])
        #expect(state.phase == .failed(message: "Connection lost", retryable: true))
    }

    @Test("events after done do not change the state")
    func ignoresEventsAfterDone() {
        let finished = reduce([
            .done(conversationId: "conversation-1", messageId: "message-1", parts: [.text("Done")])
        ])

        #expect(
            EgoTurnReducer.reduce(finished, applying: .token("late")) == finished)
    }

    @Test("events after failure do not change the state")
    func ignoresEventsAfterFailure() {
        let failed = reduce([.failed(message: "Timed out", retryable: true)])

        #expect(EgoTurnReducer.reduce(failed, applying: .part(.text("late"))) == failed)
    }

    @Test("a later navigation event replaces the earlier target")
    func replacesNavigationTarget() {
        let state = reduce([
            .navigate(uri: "pops:inventory/item/18"),
            .navigate(uri: "pops:finance/transaction/9"),
        ])

        #expect(state.navigationTarget == "pops:finance/transaction/9")
    }
}

private func reduce(_ events: [EgoStreamEvent]) -> EgoTurnState {
    events.reduce(.initial) { state, event in
        EgoTurnReducer.reduce(state, applying: event)
    }
}
