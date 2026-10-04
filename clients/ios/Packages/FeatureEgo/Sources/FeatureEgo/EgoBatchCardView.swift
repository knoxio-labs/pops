import AppCore
import DesignSystem
import SwiftUI

/// One review card for the write actions in an Ego response.
@MainActor
internal struct EgoBatchCardView: View {
    @Bindable internal var model: EgoBatchModel

    private var presentation: EgoBatchCardPresentation {
        EgoBatchCardPresentation(
            batch: model.part,
            ticked: model.ticked,
            alwaysAllow: model.alwaysAllow,
            phase: model.phase,
            canDecide: model.canDecide,
            canContinue: model.canContinue
        )
    }

    internal var body: some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                Text("Proposed actions")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .accessibilityAddTraits(.isHeader)

                actionRows

                if !presentation.toolOptions.isEmpty {
                    toolAllowances
                }

                if let failureMessage = presentation.failureMessage {
                    Text(failureMessage)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsDestructive)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if model.phase == .working {
                    submittingIndicator
                }

                if presentation.showsButtons {
                    decisionButtons
                }

                if presentation.showsContinue {
                    continueAction
                }
            }
        }
        .accessibilityIdentifier(EgoBatchCardAccessibility.card)
    }

    private var actionRows: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            ForEach(presentation.rows) { row in
                EgoBatchCardActionRow(row: row) {
                    model.toggle(actionId: row.actionId)
                }
            }
        }
    }

    private var toolAllowances: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            ForEach(presentation.toolOptions) { option in
                Toggle(
                    isOn: Binding(
                        get: { model.alwaysAllow.contains(option.tool) },
                        set: { model.setAlwaysAllow(option.tool, $0) }
                    )
                ) {
                    Text("Always allow \(option.label) in this conversation")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .tint(Color.popsAccent)
                .accessibilityIdentifier(EgoBatchCardAccessibility.toolToggle(option.tool))
            }
        }
    }

    private var submittingIndicator: some View {
        HStack(spacing: PopsSpacing.sm) {
            ProgressView()
                .tint(Color.popsAccent)
            Text("Submitting decision")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Submitting decision")
    }

    private var decisionButtons: some View {
        HStack(spacing: PopsSpacing.sm) {
            Button(role: presentation.usesDestructiveRole ? .destructive : nil) {
                Task { await model.approve() }
            } label: {
                Text(presentation.approveTitle)
                    .font(.popsHeadline)
                    .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
            }
            .buttonStyle(.borderedProminent)
            .tint(presentation.usesDestructiveRole ? Color.popsDestructive : Color.popsAccent)
            .disabled(!presentation.approveEnabled)
            .accessibilityIdentifier(EgoBatchCardAccessibility.approve)

            Button(role: .destructive) {
                Task { await model.rejectAll() }
            } label: {
                Text("Reject all")
                    .font(.popsHeadline)
                    .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
            }
            .buttonStyle(.bordered)
            .tint(Color.popsDestructive)
            .disabled(!presentation.rejectEnabled)
            .accessibilityIdentifier(EgoBatchCardAccessibility.rejectAll)
        }
    }

    private var continueAction: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text("This decision was saved but the actions have not finished.")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Spacer(minLength: PopsSpacing.zero)
                Button {
                    Task { await model.continueTurn() }
                } label: {
                    Text(presentation.continueTitle)
                        .font(.popsHeadline)
                        .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.popsAccent)
                .accessibilityIdentifier(EgoBatchCardAccessibility.continueButton)
            }
        }
    }
}

private struct EgoBatchCardActionRow: View {
    internal let row: EgoBatchCardPresentation.Row
    internal let toggle: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            if row.showsCheckbox {
                Button(action: toggle) {
                    Image(systemName: row.isTicked ? "checkmark.square.fill" : "square")
                        .font(.popsTitle)
                        .foregroundStyle(
                            row.isTicked ? Color.popsAccent : Color.popsMutedForeground
                        )
                        .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(row.summary)
                .accessibilityValue(row.isTicked ? "Selected" : "Not selected")
                .accessibilityIdentifier(EgoBatchCardAccessibility.checkbox(row.actionId))
            }

            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(row.summary)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)

                Text(row.toolLabel)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let statusLabel = row.statusLabel, let statusSymbol = row.statusSymbol {
                HStack(spacing: PopsSpacing.xs) {
                    Image(systemName: statusSymbol)
                        .accessibilityHidden(true)
                    Text(statusLabel)
                }
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(statusColor)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(statusLabel)
                .accessibilityIdentifier(EgoBatchCardAccessibility.status(row.actionId))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var statusColor: Color {
        switch row.status {
        case .pending: .popsMutedForeground
        case .confirmed: .popsAccent
        case .executed: .popsSuccess
        case .rejected: .popsMutedForeground
        case .failed: .popsDestructive
        }
    }
}

private enum EgoBatchCardAccessibility {
    static let card = "ego-batch-card"
    static let approve = "ego-batch-approve"
    static let rejectAll = "ego-batch-reject-all"
    static let continueButton = "ego-batch-continue"

    static func checkbox(_ actionId: String) -> String {
        "ego-batch-checkbox-\(actionId)"
    }

    static func toolToggle(_ tool: String) -> String {
        "ego-batch-tool-allow-\(tool)"
    }

    static func status(_ actionId: String) -> String {
        "ego-batch-status-\(actionId)"
    }
}

#Preview("Ego batch — mixed actions") {
    EgoBatchCardView(
        model: EgoBatchModel(
            part: EgoActionsPart(
                batchId: "preview-batch",
                actions: [
                    EgoBatchAction(
                        actionId: "move-item",
                        tool: "inventory.items.move",
                        summary: "Move the blue bicycle to the garage",
                        status: .pending
                    ),
                    EgoBatchAction(
                        actionId: "delete-receipt",
                        tool: "purchases.documents.delete",
                        summary: "Delete the duplicate receipt",
                        status: .pending
                    ),
                    EgoBatchAction(
                        actionId: "completed-item",
                        tool: "inventory.items.update",
                        summary: "Update the item's location",
                        status: .executed
                    ),
                ]
            ),
            decide: { _, _ in }
        )
    )
    .padding(PopsSpacing.lg)
    .background(Color.popsBackground.ignoresSafeArea())
    .preferredColorScheme(.dark)
}
