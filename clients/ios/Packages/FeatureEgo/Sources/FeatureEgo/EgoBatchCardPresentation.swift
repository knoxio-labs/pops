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
    internal let approveEnabled: Bool
    internal let rejectEnabled: Bool
    internal let showsButtons: Bool
    internal let usesDestructiveRole: Bool
    internal let failureMessage: String?

    internal init(
        batch: EgoActionsPart,
        ticked: Set<String>,
        alwaysAllow: Set<String>,
        phase: EgoBatchPhase,
        canDecide: Bool
    ) {
        rows = batch.actions.map { action in
            Self.row(for: action, ticked: ticked, canDecide: canDecide)
        }
        toolOptions =
            canDecide
            ? Self.distinctTools(in: batch.actions).map { tool in
                ToolOption(
                    tool: tool,
                    label: EgoToolPresentation.label(for: tool, status: .started),
                    isOn: alwaysAllow.contains(tool)
                )
            }
            : []

        let selectedRows = rows.filter(\.isTicked)
        approveTitle = "Approve \(selectedRows.count)"
        approveEnabled = canDecide && phase != .working && !selectedRows.isEmpty
        rejectEnabled = canDecide && phase != .working
        showsButtons = canDecide
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
            toolLabel: EgoToolPresentation.label(for: action.tool, status: .started),
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
