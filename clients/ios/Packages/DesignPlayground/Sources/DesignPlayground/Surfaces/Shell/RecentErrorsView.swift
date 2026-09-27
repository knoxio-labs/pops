import DesignSystem
import SwiftUI

internal struct RecentErrorsView: View {
    internal let errors: RecentErrors
    @State private var detail: PresentedError?

    internal var body: some View {
        Group {
            if errors.entries.isEmpty {
                ContentUnavailableView {
                    Label("No recent errors", systemImage: "checkmark.circle")
                } description: {
                    Text("Failures from this device will appear here.")
                }
            } else {
                List(errors.entries) { error in
                    Button {
                        detail = error
                    } label: {
                        RecentErrorRow(error: error)
                    }
                    .buttonStyle(.plain)
                }
                .playgroundInsetGroupedList()
            }
        }
        .sheet(item: $detail) { error in
            NavigationStack {
                ErrorDetailSheet(error: error)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}

internal struct ErrorDiagnosticsEntryView: View {
    internal var body: some View {
        List {
            Section("September") {
                LabeledContent("Groceries", value: "$84.20")
                LabeledContent("Train fare", value: "$6.80")
                LabeledContent("Coffee", value: "$5.40")
            }
        }
        .playgroundInsetGroupedList()
        .playgroundTrailingBarItem {
            Menu {
                Button {
                } label: {
                    Label("Recent errors", systemImage: "exclamationmark.bubble")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
            }
            .accessibilityLabel("App menu")
        }
    }
}

private struct RecentErrorRow: View {
    let error: PresentedError

    var body: some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            Image(systemName: "xmark.octagon.fill")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsDestructive)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(error.operation)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text(error.message)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(2)
                Text(error.code)
                    .font(.popsMonospacedCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
                Text(error.occurredAt)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            Image(systemName: "chevron.right")
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityHidden(true)
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Shows error details")
    }
}
