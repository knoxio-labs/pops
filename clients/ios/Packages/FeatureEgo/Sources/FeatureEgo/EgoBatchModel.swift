import AppCore
import Observation

/// The local phase of one conversation's pending Ego batch.
public enum EgoBatchPhase: Hashable, Sendable {
    case idle
    case working
    case failed(message: String)
}

/// Holds one batch's selection, tool allowance choices and decision request.
/// Tool allowances stay on this instance and travel only with its batch decision.
@MainActor
@Observable
public final class EgoBatchModel {
    private let decideBatch: @MainActor (String, EgoBatchDecision) async throws -> Void
    private let isEnabled: @MainActor () -> Bool
    private let resumeBatch: @MainActor (String) async -> Void
    private let isContinuable: @MainActor () -> Bool

    public private(set) var part: EgoActionsPart
    public private(set) var ticked: Set<String>
    public private(set) var alwaysAllow: Set<String> = []
    public private(set) var phase: EgoBatchPhase = .idle

    public var tools: [String] {
        var seen = Set<String>()
        return part.actions.compactMap { action in
            guard seen.insert(action.tool).inserted else { return nil }
            return action.tool
        }
    }

    public var canDecide: Bool {
        part.hasPending && phase != .working && isEnabled()
    }

    /// Whether this decided batch can resume its saved turn.
    public var canContinue: Bool {
        isContinuable() && phase != .working && isEnabled() && !part.hasPending
    }

    public init(
        part: EgoActionsPart,
        decide: @escaping @MainActor (String, EgoBatchDecision) async throws -> Void,
        isEnabled: @escaping @MainActor () -> Bool = { true },
        resume: @escaping @MainActor (String) async -> Void = { _ in },
        isContinuable: @escaping @MainActor () -> Bool = { false }
    ) {
        self.part = part
        decideBatch = decide
        self.isEnabled = isEnabled
        resumeBatch = resume
        self.isContinuable = isContinuable
        ticked = Set(part.actions.filter(\.status.isActionable).map(\.actionId))
    }

    public func toggle(actionId: String) {
        guard canDecide,
            part.actions.contains(where: { $0.actionId == actionId && $0.status.isActionable })
        else {
            return
        }

        if !ticked.insert(actionId).inserted {
            ticked.remove(actionId)
        }
    }

    public func setAlwaysAllow(_ tool: String, _ on: Bool) {
        guard canDecide, tools.contains(tool) else { return }
        if on {
            alwaysAllow.insert(tool)
        } else {
            alwaysAllow.remove(tool)
        }
    }

    public func approve() async {
        guard canDecide else { return }

        let pending = part.actions.filter(\.status.isActionable)
        let approved = pending.filter { ticked.contains($0.actionId) }
        guard !approved.isEmpty else { return }

        let rejected = pending.filter { !ticked.contains($0.actionId) }
        let allowedTools = tools.filter { tool in
            alwaysAllow.contains(tool) && approved.contains(where: { $0.tool == tool })
        }
        let decision = EgoBatchDecision(
            approve: approved.map(\.actionId),
            reject: rejected.map(\.actionId),
            alwaysAllow: allowedTools
        )
        await submit(
            decision,
            approvedActionIDs: Set(approved.map(\.actionId)),
            rejectedActionIDs: Set(rejected.map(\.actionId))
        )
    }

    public func rejectAll() async {
        guard canDecide else { return }

        let pending = part.actions.filter(\.status.isActionable)
        await submit(
            EgoBatchDecision(approve: [], reject: pending.map(\.actionId), alwaysAllow: []),
            approvedActionIDs: [],
            rejectedActionIDs: Set(pending.map(\.actionId))
        )
    }

    /// Resumes a saved turn without changing the locally displayed action statuses.
    public func continueTurn() async {
        guard canContinue else { return }
        await resumeBatch(part.batchId)
    }

    /// Applies a same-batch reload without reviving an action already resolved locally.
    public func sync(_ incoming: EgoActionsPart) {
        guard incoming.batchId == part.batchId else { return }
        guard !incoming.hasPending || part.hasPending else { return }

        let previousPending = Set(part.actions.filter(\.status.isActionable).map(\.actionId))
        let previousTicks = ticked
        let previousStatuses = Dictionary(
            part.actions.map { ($0.actionId, $0.status) },
            uniquingKeysWith: { first, _ in first }
        )
        let mergedActions = incoming.actions.map { action in
            guard let previousStatus = previousStatuses[action.actionId],
                !previousStatus.isActionable,
                action.status.isActionable
            else {
                return action
            }

            return EgoBatchAction(
                actionId: action.actionId,
                tool: action.tool,
                summary: action.summary,
                status: previousStatus
            )
        }

        part = EgoActionsPart(batchId: incoming.batchId, actions: mergedActions)
        ticked = Set(
            mergedActions.compactMap { action in
                guard action.status.isActionable else { return nil }
                guard previousPending.contains(action.actionId) else { return action.actionId }
                return previousTicks.contains(action.actionId) ? action.actionId : nil
            })
    }

    private func submit(
        _ decision: EgoBatchDecision,
        approvedActionIDs: Set<String>,
        rejectedActionIDs: Set<String>
    ) async {
        phase = .working
        do {
            try await decideBatch(part.batchId, decision)
            resolvePending(
                approvedActionIDs: approvedActionIDs, rejectedActionIDs: rejectedActionIDs)
            phase = .idle
        } catch {
            phase = .failed(message: batchDecisionFailureMessage())
        }
    }

    private func resolvePending(approvedActionIDs: Set<String>, rejectedActionIDs: Set<String>) {
        let actions = part.actions.map { action -> EgoBatchAction in
            guard action.status.isActionable else { return action }
            let status: EgoActionStatus?
            if approvedActionIDs.contains(action.actionId) {
                status = .confirmed
            } else if rejectedActionIDs.contains(action.actionId) {
                status = .rejected
            } else {
                status = nil
            }
            guard let status else { return action }

            return EgoBatchAction(
                actionId: action.actionId,
                tool: action.tool,
                summary: action.summary,
                status: status
            )
        }
        part = EgoActionsPart(batchId: part.batchId, actions: actions)
    }

    private func batchDecisionFailureMessage() -> String {
        "Could not submit the decision. Your selections are still here. Try again."
    }
}
