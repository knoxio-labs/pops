import AppCore
import Foundation
import Testing

@testable import FeatureEgo

@Suite("Ego thread presentation")
internal struct EgoThreadPresentationTests {
    @Test("message parts preserve order and consecutive text shares one row")
    func messagePartsPreserveOrder() {
        let entity = sampleEntity()
        let batch = sampleBatch("batch-1")
        let message = makeMessage(
            "message-1",
            [
                .text("Before "), .text("entity"), .entity(entity), .text("After"),
                .actions(batch),
            ])

        #expect(
            EgoThreadRow.rows(messages: [message], turn: nil, notices: []) == [
                .text(messageId: "message-1", role: .assistant, text: "Before entity"),
                .entity(messageId: "message-1", index: 2, part: entity),
                .text(messageId: "message-1", role: .assistant, text: "After"),
                .actions(messageId: "message-1", index: 4, part: batch),
            ])
    }

    @Test("streaming tools precede streamed parts and the live text row")
    func streamingRowsFollowTranscript() {
        let entity = sampleEntity()
        let batch = sampleBatch("stream-batch")
        let tool = EgoToolActivity(id: 0, name: "inventory.items.list", status: .started)
        let turn = EgoTurnState(
            streamedText: "Here are the results",
            tools: [tool],
            parts: [.text("ignored"), .entity(entity), .actions(batch)])
        let messages = [makeMessage("message-1", [.text("Earlier")])]

        #expect(
            EgoThreadRow.rows(messages: messages, turn: turn, notices: []) == [
                .text(messageId: "message-1", role: .assistant, text: "Earlier"),
                .tool(tool),
                .entity(messageId: "streaming-turn", index: 1, part: entity),
                .actions(messageId: "streaming-turn", index: 2, part: batch),
                .streaming(text: "Here are the results"),
            ])
    }

    @Test("failed turn keeps partial text before a non-streaming failure row")
    func failedTurnKeepsPartialText() {
        let turn = EgoTurnState(
            streamedText: "Partial answer",
            tools: [EgoToolActivity(id: 0, name: "inventory.items.list", status: .started)],
            parts: [.entity(sampleEntity())],
            phase: .failed(message: "Connection lost", retryable: true))

        #expect(
            EgoThreadRow.rows(messages: [], turn: turn, notices: []) == [
                .text(messageId: "failed-turn", role: .assistant, text: "Partial answer"),
                .failure(message: "Connection lost", retryable: true),
            ])
    }

    @Test("a failed turn without partial text has no empty text or streaming row")
    func failedTurnWithoutText() {
        let turn = EgoTurnState(phase: .failed(message: "Stopped", retryable: false))

        #expect(
            EgoThreadRow.rows(messages: [], turn: turn, notices: []) == [
                .failure(message: "Stopped", retryable: false)
            ])
    }

    @Test("a nil turn adds no live rows")
    func nilTurnAddsNothing() {
        #expect(EgoThreadRow.rows(messages: [], turn: nil, notices: []).isEmpty)
        let message = makeMessage("message-1", [.text("Saved")])
        #expect(
            EgoThreadRow.rows(messages: [message], turn: nil, notices: []) == [
                .text(messageId: "message-1", role: .assistant, text: "Saved")
            ])
    }

    @Test("notices are the final rows")
    func noticesComeLast() {
        let turn = EgoTurnState(streamedText: "Live")
        let rows = EgoThreadRow.rows(
            messages: [makeMessage("message-1", [.text("Saved")])],
            turn: turn,
            notices: ["Opens in Purchases", "That link is not valid"]
        )

        #expect(
            rows.suffix(2) == [.notice("Opens in Purchases"), .notice("That link is not valid")])
    }

    @Test("entity row ids include their message id")
    func entityIdsAreUniqueAcrossMessages() {
        let messages = [
            makeMessage("message-1", [.entity(sampleEntity())]),
            makeMessage("message-2", [.entity(sampleEntity())]),
        ]
        let rows = EgoThreadRow.rows(messages: messages, turn: nil, notices: [])

        #expect(rows.count == 2)
        #expect(Set(rows.map(\.id)).count == rows.count)
    }

    private func makeMessage(_ id: String, _ parts: [EgoMessagePart]) -> EgoMessage {
        EgoMessage(
            id: id,
            role: .assistant,
            parts: parts,
            createdAt: Date(timeIntervalSince1970: 0)
        )
    }

    private func sampleEntity() -> EgoEntityPart {
        EgoEntityPart(uri: "pops:inventory/item/1", title: "Blue bike", subtitle: "Garage")
    }

    private func sampleBatch(_ id: String) -> EgoActionsPart {
        EgoActionsPart(
            batchId: id,
            actions: [
                EgoBatchAction(
                    actionId: "move-1",
                    tool: "inventory.items.move",
                    summary: "Move the blue bike",
                    status: .pending
                )
            ]
        )
    }
}
