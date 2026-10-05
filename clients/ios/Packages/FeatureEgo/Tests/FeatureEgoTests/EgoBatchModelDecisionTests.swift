import AppCore
import Testing

@testable import FeatureEgo

@MainActor
@Suite("Ego batch decisions")
internal struct EgoBatchModelDecisionTests {
    @Test("selects every pending action and keeps tool order unique")
    func initialSelectionAndTools() {
        let model = EgoBatchModel(
            part: makePart([
                action("a1", "inventory.items.move"),
                action("a2", "finance.transactions.update"),
                action("a3", "inventory.items.move"),
            ]),
            decide: { _, _ in }
        )

        #expect(model.ticked == Set(["a1", "a2", "a3"]))
        #expect(model.tools == ["inventory.items.move", "finance.transactions.update"])
        #expect(model.canDecide)
    }

    @Test("approves selected actions in source order and rejects the rest")
    func approveUsesActionOrder() async {
        var decisions: [EgoBatchDecision] = []
        let model = EgoBatchModel(
            part: makePart([action("a1"), action("a2"), action("a3")]),
            decide: { _, decision in decisions.append(decision) }
        )
        model.toggle(actionId: "a2")

        await model.approve()

        #expect(
            decisions == [EgoBatchDecision(approve: ["a1", "a3"], reject: ["a2"], alwaysAllow: [])])
        #expect(statuses(model) == [.confirmed, .rejected, .confirmed])
        #expect(!model.canDecide)
    }

    @Test("decides pending rows without changing already resolved actions")
    func mixedResolvedAndPending() async {
        var sent: EgoBatchDecision?
        let model = EgoBatchModel(
            part: makePart([
                action("done", "tool.done", .executed),
                action("approve", "tool.write"),
                action("failed", "tool.failed", .failed),
                action("cancel", "tool.write"),
            ]),
            decide: { _, decision in sent = decision }
        )
        #expect(model.ticked == Set(["approve", "cancel"]))
        model.toggle(actionId: "cancel")

        await model.approve()

        #expect(sent == EgoBatchDecision(approve: ["approve"], reject: ["cancel"], alwaysAllow: []))
        #expect(statuses(model) == [.executed, .confirmed, .failed, .rejected])
    }

    @Test("only sends always-allow for a tool with a ticked action, per model")
    func toolAllowanceIsBatchLocal() async {
        let move = "inventory.items.move"
        let finance = "finance.transactions.update"
        var sent: EgoBatchDecision?
        let first = EgoBatchModel(
            part: makePart([action("i1", move), action("f1", finance), action("i2", move)]),
            decide: { _, decision in sent = decision }
        )
        let second = EgoBatchModel(part: makePart([action("other", move)]), decide: { _, _ in })
        first.setAlwaysAllow(move, true)
        first.setAlwaysAllow(finance, true)
        first.toggle(actionId: "i1")
        first.toggle(actionId: "i2")

        await first.approve()

        #expect(sent?.alwaysAllow == [finance])
        #expect(first.alwaysAllow == Set([move, finance]))
        #expect(second.alwaysAllow.isEmpty)
    }

    @Test("reject all cancels every pending action and sends no tool allowance")
    func rejectAllCancelsPendingActions() async {
        var sent: EgoBatchDecision?
        let model = EgoBatchModel(
            part: makePart([
                action("done", "tool.done", .executed),
                action("a1"),
                action("a2"),
                action("failed", "tool.failed", .failed),
            ]),
            decide: { _, decision in sent = decision }
        )
        model.toggle(actionId: "a1")
        model.setAlwaysAllow("inventory.items.move", true)

        await model.rejectAll()

        #expect(sent == EgoBatchDecision(approve: [], reject: ["a1", "a2"], alwaysAllow: []))
        #expect(statuses(model) == [.executed, .rejected, .rejected, .failed])
    }

    @Test("failure keeps pending rows and selections available for retry")
    func failedDecisionCanRetry() async {
        var calls = 0
        var decisions: [EgoBatchDecision] = []
        let model = EgoBatchModel(
            part: makePart([action("a1"), action("a2")]),
            decide: { _, decision in
                calls += 1
                if calls == 1 { throw TestFailure.planned }
                decisions.append(decision)
            })
        model.toggle(actionId: "a2")
        model.setAlwaysAllow("inventory.items.move", true)

        await model.approve()

        #expect(
            model.phase
                == .failed(
                    message:
                        "Could not submit the decision. Your selections are still here. Try again.")
        )
        #expect(statuses(model) == [.pending, .pending])
        #expect(model.ticked == Set(["a1"]))
        #expect(model.alwaysAllow == Set(["inventory.items.move"]))
        #expect(model.canDecide)

        await model.approve()

        #expect(calls == 2)
        #expect(
            decisions == [
                EgoBatchDecision(
                    approve: ["a1"], reject: ["a2"], alwaysAllow: ["inventory.items.move"])
            ])
        #expect(statuses(model) == [.confirmed, .rejected])
    }

    private func action(
        _ id: String,
        _ tool: String = "inventory.items.move",
        _ status: EgoActionStatus = .pending
    ) -> EgoBatchAction {
        EgoBatchAction(actionId: id, tool: tool, summary: id, status: status)
    }

    private func makePart(_ actions: [EgoBatchAction]) -> EgoActionsPart {
        EgoActionsPart(batchId: "batch-1", actions: actions)
    }

    private func statuses(_ model: EgoBatchModel) -> [EgoActionStatus] {
        model.part.actions.map(\.status)
    }
}

private enum TestFailure: Error {
    case planned
}
