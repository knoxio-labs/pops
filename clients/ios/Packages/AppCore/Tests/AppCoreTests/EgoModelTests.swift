import Foundation
import Testing

@testable import AppCore

@Suite("Ego domain models")
internal struct EgoModelTests {
    @Test("object URI resolves through the ADR-012 parser")
    func objectURI() {
        #expect(
            entity(uri: "pops:finance/transaction/9").objectURI
                == PopsURI(pillar: "finance", type: "transaction", id: "9"))
        #expect(entity(uri: "not a uri").objectURI == nil)
        #expect(entity(uri: "pops://finance/transaction/9").objectURI == nil)
    }

    @Test("only pending actions are actionable")
    func actionStatus() {
        #expect(EgoActionStatus.pending.isActionable)
        #expect(!EgoActionStatus.confirmed.isActionable)
        #expect(!EgoActionStatus.rejected.isActionable)
        #expect(!EgoActionStatus.executed.isActionable)
        #expect(!EgoActionStatus.failed.isActionable)
    }

    @Test("a batch reports pending, resolved, and empty action lists")
    func batchPendingState() {
        let withPending = EgoActionsPart(
            batchId: "batch-1",
            actions: [
                action("approve", status: .pending),
                action("done", status: .executed),
            ])
        #expect(withPending.hasPending)

        let resolved = EgoActionsPart(
            batchId: "batch-2",
            actions: [
                action("confirmed", status: .confirmed),
                action("rejected", status: .rejected),
                action("executed", status: .executed),
                action("failed", status: .failed),
            ])
        #expect(!resolved.hasPending)
        #expect(!EgoActionsPart(batchId: "empty", actions: []).hasPending)
    }

    @Test("plain text joins only text parts in order")
    func plainText() {
        let message = EgoMessage(
            id: "message-1",
            role: .assistant,
            parts: [
                .text("Here is the transaction."),
                .entity(entity(uri: "pops:finance/transaction/9", title: "Private entity title")),
                .text("Would you like to review it?"),
                .actions(
                    EgoActionsPart(
                        batchId: "batch-1",
                        actions: [
                            action(
                                "update",
                                summary: "Private action summary",
                                status: .pending)
                        ])),
            ],
            createdAt: Date(timeIntervalSince1970: 1))

        #expect(message.plainText == "Here is the transaction.\nWould you like to review it?")
        #expect(!message.plainText.contains("Private entity title"))
        #expect(!message.plainText.contains("Private action summary"))
    }

    private func entity(uri: String, title: String = "Transaction") -> EgoEntityPart {
        EgoEntityPart(uri: uri, title: title, subtitle: nil)
    }

    private func action(
        _ actionId: String,
        summary: String = "Update transaction",
        status: EgoActionStatus
    ) -> EgoBatchAction {
        EgoBatchAction(actionId: actionId, tool: "finance.update", summary: summary, status: status)
    }
}
