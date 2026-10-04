import AppCore
import Testing

@testable import FeatureEgo

@MainActor
@Suite("Ego batch model sync")
internal struct EgoBatchModelSyncTests {
    @Test("sync adopts resolved server state but never resurrects resolved rows")
    func syncDoesNotMoveActionsBackToPending() {
        let model = EgoBatchModel(
            part: makePart([action("a1"), action("a2")]), decide: { _, _ in })
        model.sync(
            makePart([
                action("a1", "inventory.items.move", .executed),
                action("a2", "inventory.items.move", .rejected),
            ]))
        #expect(statuses(model) == [.executed, .rejected])
        model.sync(makePart([action("a1"), action("a2")]))
        #expect(statuses(model) == [.executed, .rejected])
        #expect(!model.canDecide)

        let mixed = EgoBatchModel(
            part: makePart([action("done", "tool.done", .confirmed), action("pending")]),
            decide: { _, _ in }
        )
        mixed.sync(makePart([action("done"), action("pending")]))
        #expect(statuses(mixed) == [.confirmed, .pending])
    }

    @Test("sync during an in-flight request is not overwritten on success")
    func serverResolutionWinsOverRequestCompletion() async {
        var modelRef: EgoBatchModel?
        let server = makePart([
            action("a1", "inventory.items.move", .executed),
            action("a2", "inventory.items.move", .rejected),
            action("a3", "inventory.items.move", .executed),
        ])
        let model = EgoBatchModel(
            part: makePart([action("a1"), action("a2"), action("a3")]),
            decide: { _, _ in
                modelRef?.sync(server)
            })
        modelRef = model

        await model.approve()

        #expect(statuses(model) == [.executed, .rejected, .executed])
    }

    @Test("empty, disabled and already-resolved batches issue no decision")
    func cannotDecideWithoutEnabledPendingSelection() async {
        var calls = 0
        let empty = EgoBatchModel(part: makePart([action("a1")]), decide: { _, _ in calls += 1 })
        empty.toggle(actionId: "a1")
        await empty.approve()
        #expect(calls == 0)

        let disabled = EgoBatchModel(
            part: makePart([action("a1")]),
            decide: { _, _ in calls += 1 },
            isEnabled: { false }
        )
        disabled.toggle(actionId: "a1")
        disabled.setAlwaysAllow("inventory.items.move", true)
        await disabled.approve()
        await disabled.rejectAll()
        #expect(!disabled.canDecide)
        #expect(disabled.ticked == Set(["a1"]))
        #expect(disabled.alwaysAllow.isEmpty)
        #expect(calls == 0)

        let resolved = EgoBatchModel(
            part: makePart([action("a1", "inventory.items.move", .executed)]),
            decide: { _, _ in calls += 1 }
        )
        await resolved.approve()
        #expect(!resolved.canDecide)
        #expect(calls == 0)
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
