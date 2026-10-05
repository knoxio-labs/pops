import AppCore

/// The rows and decision controls shown for one Ego batch.
internal struct EgoBatchCardPresentation: Hashable {
    internal struct Row: Hashable, Identifiable {
        internal let actionId: String
        internal let status: EgoActionStatus
        internal let summary: String
        internal let toolLabel: String
        internal let isTicked: Bool
        internal let isDestructive: Bool
        internal let showsCheckbox: Bool
        internal let statusLabel: String?
        internal let statusSymbol: String?

        internal var id: String { actionId }
    }

    internal struct ToolOption: Hashable, Identifiable {
        internal let tool: String
        internal let label: String
        internal let isOn: Bool

        internal var id: String { tool }
    }

    internal let rows: [Row]
    internal let toolOptions: [ToolOption]
    internal let approveTitle: String
    internal let continueTitle: String
    internal let approveEnabled: Bool
    internal let rejectEnabled: Bool
    internal let showsButtons: Bool
    internal let showsContinue: Bool
    internal let usesDestructiveRole: Bool
    internal let failureMessage: String?

    internal init(
        batch: EgoActionsPart,
        ticked: Set<String>,
        alwaysAllow: Set<String>,
        phase: EgoBatchPhase,
        canDecide: Bool,
        canContinue: Bool = false
    ) {
        rows = batch.actions.map { action in
            Self.row(for: action, ticked: ticked, canDecide: canDecide && !canContinue)
        }
        toolOptions =
            canDecide && !canContinue
            ? Self.distinctTools(in: batch.actions).map { tool in
                ToolOption(
                    tool: tool,
                    label: Self.permissionLabel(for: tool),
                    isOn: alwaysAllow.contains(tool)
                )
            }
            : []

        let selectedRows = rows.filter(\.isTicked)
        approveTitle = "Approve \(selectedRows.count)"
        continueTitle = "Continue"
        approveEnabled = canDecide && !canContinue && phase != .working && !selectedRows.isEmpty
        rejectEnabled = canDecide && !canContinue && phase != .working
        showsButtons = canDecide && !canContinue
        showsContinue = canContinue
        usesDestructiveRole = selectedRows.contains(where: \.isDestructive)
        if case .failed(let message) = phase {
            failureMessage = message
        } else {
            failureMessage = nil
        }
    }

    private static func row(
        for action: EgoBatchAction,
        ticked: Set<String>,
        canDecide: Bool
    ) -> Row {
        let isPending = action.status.isActionable
        return Row(
            actionId: action.actionId,
            status: action.status,
            summary: action.summary,
            toolLabel: "Changes to \(changeScope(for: action.tool))",
            isTicked: isPending && ticked.contains(action.actionId),
            isDestructive: isDestructiveTool(action.tool),
            showsCheckbox: isPending && canDecide,
            statusLabel: statusLabel(for: action.status),
            statusSymbol: statusSymbol(for: action.status)
        )
    }

    private static func distinctTools(in actions: [EgoBatchAction]) -> [String] {
        var seen = Set<String>()
        return actions.compactMap { seen.insert($0.tool).inserted ? $0.tool : nil }
    }

    private static func permissionLabel(for tool: String) -> String {
        "changes to \(changeScope(for: tool))"
    }

    private static func changeScope(for tool: String) -> String {
        let domain = tool.split(whereSeparator: { ".-_".contains($0) }).first?.lowercased()
        return switch domain {
        case "finance": "financial data"
        case "purchases": "purchases"
        case "inventory": "inventory"
        case "media": "the media library"
        case "cerebrum": "notes"
        case let domain?: domain
        case nil: "this action"
        }
    }

    private static func isDestructiveTool(_ tool: String) -> Bool {
        guard let lastSegment = tool.split(whereSeparator: { ".-_".contains($0) }).last
        else {
            return false
        }
        return ["delete", "remove", "discard", "abandon"].contains(lastSegment.lowercased())
    }

    private static func statusLabel(for status: EgoActionStatus) -> String? {
        switch status {
        case .pending: nil
        case .confirmed: "Running"
        case .executed: "Done"
        case .rejected: "Cancelled"
        case .failed: "Failed"
        }
    }

    private static func statusSymbol(for status: EgoActionStatus) -> String? {
        switch status {
        case .pending: nil
        case .confirmed: "ellipsis.circle"
        case .executed: "checkmark.circle"
        case .rejected: "xmark.circle"
        case .failed: "exclamationmark.circle"
        }
    }
}
