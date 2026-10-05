import DesignSystem
import SwiftUI

@MainActor
internal struct EgoBatchCardDecisionButtons: View {
    internal let approveTitle: String
    internal let usesDestructiveRole: Bool
    internal let approveEnabled: Bool
    internal let rejectEnabled: Bool
    internal let onApprove: () -> Void
    internal let onRejectAll: () -> Void

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    internal var body: some View {
        switch EgoBatchCardDecisionLayout.resolve(for: dynamicTypeSize) {
        case .inline:
            HStack(spacing: PopsSpacing.sm) {
                approveButton
                rejectAllButton
            }
        case .stacked:
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                approveButton
                rejectAllButton
            }
        }
    }

    private var approveButton: some View {
        Button(role: usesDestructiveRole ? .destructive : nil, action: onApprove) {
            Text(approveTitle)
                .font(.popsHeadline)
                .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
        }
        .buttonStyle(.borderedProminent)
        .tint(usesDestructiveRole ? Color.popsDestructive : Color.popsAccent)
        .disabled(!approveEnabled)
        .accessibilityIdentifier(EgoBatchCardAccessibility.approve)
    }

    private var rejectAllButton: some View {
        Button(role: .destructive, action: onRejectAll) {
            Text("Reject all")
                .font(.popsHeadline)
                .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
        }
        .buttonStyle(.bordered)
        .tint(Color.popsDestructive)
        .disabled(!rejectEnabled)
        .accessibilityIdentifier(EgoBatchCardAccessibility.rejectAll)
    }
}

internal enum EgoBatchCardDecisionLayout: Equatable {
    case inline
    case stacked

    internal static func resolve(for dynamicTypeSize: DynamicTypeSize) -> Self {
        dynamicTypeSize.isAccessibilitySize ? .stacked : .inline
    }
}
