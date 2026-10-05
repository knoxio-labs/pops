import AppCore
import Testing

@testable import FeatureEgo

@MainActor
@Suite("Ego batch continuation")
internal struct EgoBatchModelContinuationTests {
    @Test("continues a decided batch without changing its action statuses")
    func continuesDecidedBatch() async {
        var resumed: [String] = []
        let model = EgoBatchModel(
            part: makePart([
                action("approved", "inventory.items.move", .confirmed),
                action("rejected", "inventory.items.move", .rejected),
            ]),
            decide: { _, _ in },
            resume: { resumed.append($0) },
            isContinuable: { true }
        )

        #expect(model.canContinue)
        await model.continueTurn()

        #expect(resumed == ["batch-1"])
        #expect(statuses(model) == [.confirmed, .rejected])
    }

    @Test("does not continue an ineligible batch or one with pending actions")
    func continuationRequiresAnEligibleResolvedBatch() async {
        var resumed: [String] = []
        let resume: @MainActor (String) async -> Void = { resumed.append($0) }
        let resolvedPart = makePart([
            action("approved", "inventory.items.move", .confirmed),
            action("rejected", "inventory.items.move", .rejected),
        ])
        let notContinuable = EgoBatchModel(
            part: resolvedPart,
            decide: { _, _ in },
            resume: resume,
            isContinuable: { false }
        )
        #expect(!notContinuable.canContinue)
        await notContinuable.continueTurn()

        let pending = EgoBatchModel(
            part: makePart([action("pending")]),
            decide: { _, _ in },
            resume: resume,
            isContinuable: { true }
        )
        #expect(!pending.canContinue)
        await pending.continueTurn()

        let disabled = EgoBatchModel(
            part: resolvedPart,
            decide: { _, _ in },
            isEnabled: { false },
            resume: resume,
            isContinuable: { true }
        )
        #expect(!disabled.canContinue)
        await disabled.continueTurn()
        #expect(resumed.isEmpty)
    }

    @Test("does not continue while a decision request is working")
    func continuationWaitsForInFlightDecision() async {
        let gate = DecisionGate()
        var resumed: [String] = []
        let model = EgoBatchModel(
            part: makePart([action("approved")]),
            decide: { _, _ in await gate.pause() },
            resume: { resumed.append($0) },
            isContinuable: { true }
        )
        let decision = Task { await model.approve() }
        await gate.waitUntilEntered()
        model.sync(makePart([action("approved", "inventory.items.move", .confirmed)]))

        #expect(model.phase == .working)
        #expect(!model.canContinue)
        await model.continueTurn()
        #expect(resumed.isEmpty)

        gate.release()
        await decision.value
    }

    @Test("ignores a second decision while the first request is in flight")
    func requestLockBlocksDoubleTapAndCancellation() async {
        let gate = DecisionGate()
        var calls = 0
        let model = EgoBatchModel(
            part: makePart([action("a1")]),
            decide: { _, _ in
                calls += 1
                await gate.pause()
            })
        let approval = Task { await model.approve() }
        await gate.waitUntilEntered()
        #expect(model.phase == .working)
        await model.approve()
        await model.rejectAll()
        #expect(calls == 1)
        gate.release()
        await approval.value
        #expect(statuses(model) == [.confirmed])
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

@MainActor
private final class DecisionGate {
    private var entered: CheckedContinuation<Void, Never>?
    private var releaseContinuation: CheckedContinuation<Void, Never>?
    private var hasEntered = false

    func pause() async {
        hasEntered = true
        entered?.resume()
        await withCheckedContinuation { releaseContinuation = $0 }
    }

    func waitUntilEntered() async {
        guard !hasEntered else { return }
        await withCheckedContinuation { entered = $0 }
    }

    func release() {
        releaseContinuation?.resume()
        releaseContinuation = nil
    }
}
