import AppCore
import DesignSystem
import SwiftUI

/// One muted transcript line for a tool call.
internal struct EgoToolActivityView: View {
    internal let activity: EgoToolActivity

    private var label: String {
        EgoToolPresentation.label(for: activity.name, status: activity.status)
    }

    var body: some View {
        HStack(spacing: PopsSpacing.sm) {
            Image(systemName: symbolName)
                .font(.popsCaption)
                .accessibilityHidden(true)
            Text(label)
                .font(.popsCaption)
        }
        .foregroundStyle(Color.popsMutedForeground)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }

    private var symbolName: String {
        switch activity.status {
        case .started:
            "ellipsis.circle"
        case .finished:
            "checkmark.circle"
        case .failed:
            "exclamationmark.circle"
        }
    }
}
